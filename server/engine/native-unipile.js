/**
 * Pont Unipile <-> chat natif.
 *
 * Inbound : un message WhatsApp arrive via le webhook Unipile
 *   - cree/trouve le lead (par telephone)
 *   - cree/trouve la conversation (statut 'open' ou 'pending' pour cet inbox)
 *   - download des attachments dans le bucket Supabase 'chat-attachments'
 *   - transcription audio (Whisper) si message vocal sans texte
 *   - INSERT chat_messages (sender_type='contact')
 *   - declenche handleNativeMessage pour lancer l'AI
 *
 * Outbound : le relais vers Unipile est dans native-messaging.js (relayToChannel).
 */

import { downloadAttachment, sendMessage as unipileSendMessage, sendMessageWithAttachment } from '../unipile.js'
import { transcribeAudio } from './voice.js'
import { handleNativeMessage } from './index.js'

const ATTACHMENT_BUCKET = 'chat-attachments'

export function extractSenderPhone(sender) {
  return sender?.attendee_specifics?.phone_number
    || sender?.attendee_public_identifier?.split('@')[0]
    || ''
}

function isAudioAttachment(att) {
  const ct = (att?.content_type || att?.type || '').toLowerCase()
  const fn = (att?.file_name || att?.name || '').toLowerCase()
  return ct.startsWith('audio/')
    || fn.endsWith('.ogg') || fn.endsWith('.opus')
    || fn.endsWith('.mp3') || fn.endsWith('.m4a')
    || fn.endsWith('.wav')
}

function classifyAttachment(att) {
  const ct = (att?.content_type || att?.type || '').toLowerCase()
  const fn = (att?.file_name || att?.name || '').toLowerCase()
  if (ct.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(fn)) return 'image'
  if (ct.startsWith('video/') || /\.(mp4|mov|webm)$/i.test(fn)) return 'video'
  if (isAudioAttachment(att)) return 'audio'
  return 'file'
}

/**
 * Cross-reference a phone with the `branches` table. Returns
 * `{ branch_id }` when the phone matches an active branch's `mobile` or
 * `whatsapp_phone`, otherwise null.
 *
 * Why: the `metadata.is_branch=true` flag on leads is only set by the
 * dispatch-out flow (server/routes/leads.js — when sending a lead card TO a
 * branch). A coordinator who hasn't yet received a dispatch (e.g. a freshly
 * provisioned branch like the "test" branch with aaron's mobile) is invisible
 * to the engine's branch guard. This lookup catches that case.
 */
async function lookupBranchByPhone(supabase, normalizedPhone) {
  const noPlus = normalizedPhone.replace(/^\+/, '')
  const variants = [normalizedPhone, noPlus, `+${noPlus}`]
  // Build OR clause — Supabase doesn't support .in() across two columns.
  const orClauses = variants.flatMap(p => [`mobile.eq.${p}`, `whatsapp_phone.eq.${p}`]).join(',')
  const { data } = await supabase
    .from('branches')
    .select('id, name, user_id')
    .eq('is_active', true)
    .or(orClauses)
    .limit(1)
  return data?.[0] || null
}

/**
 * Resolve an inbound phone to either a lead (real customer) or a branch
 * (coordinator). Returns `{ lead?, branch? }` — exactly one of the two will
 * be set (branch wins when the phone matches both, since coordinator semantics
 * always take precedence over customer for routing).
 *
 * For real customers: returns/creates a lead row as before.
 * For coordinators: returns the matching branch (no lead row created since
 * migration 041 — branches are first-class chat contacts).
 *
 * Hybrid case (a phone matching both a branches row AND an existing real-customer
 * lead, e.g. Aaron #15562): returns BOTH — the lead anchors customer history,
 * the branch flag triggers AI skip in handleNativeMessage. The conversation
 * row will still be tagged branch_id so the engine routes correctly.
 */
async function resolveContact(supabase, userId, phone, name) {
  const normalizedPhone = phone.startsWith('+') ? phone : `+${phone}`

  // Branch lookup first — coordinator semantics dominate.
  const branch = await lookupBranchByPhone(supabase, normalizedPhone)

  // Existing lead lookup (same key as before).
  let { data: lead } = await supabase
    .from('leads')
    .select('id, name, phone, email, metadata')
    .eq('user_id', userId)
    .eq('phone', normalizedPhone)
    .limit(1)
    .maybeSingle()
  if (!lead) {
    const noPlus = phone.replace(/^\+/, '')
    const r = await supabase
      .from('leads')
      .select('id, name, phone, email, metadata')
      .eq('user_id', userId)
      .eq('phone', noPlus)
      .limit(1)
      .maybeSingle()
    lead = r.data
  }

  // Branch hit + existing lead = hybrid (customer who's also a coordinator).
  // Keep the lead, return the branch alongside.
  if (branch && lead) return { lead, branch }

  // Pure branch hit, no lead = coordinator-only. No lead row needed (migration
  // 041 made chat_conversations.contact_id nullable; conv anchors on branch_id).
  if (branch && !lead) return { branch }

  // Real customer — create lead if not found.
  if (lead) return { lead }

  // Brand-new lead. NEVER fall back to name=phone: the AI's contactContext
  // treats name=phone as "no name" so the bot will ask for it, but storing
  // the placeholder also pollutes the leads list UI. leads.name is NOT NULL
  // → use '' (UI shows '—' fallback). AI fills the real name on turn 1.
  const cleanName = (name || '').trim()
  const finalName = cleanName && cleanName !== normalizedPhone && cleanName !== normalizedPhone.replace(/^\+/, '')
    ? cleanName : ''
  const { data: created, error } = await supabase
    .from('leads')
    .insert({
      user_id: userId,
      name: finalName,
      phone: normalizedPhone,
      source: 'whatsapp_native',
      lead_channel: 'whatsapp',
      status: 'new',
    })
    .select('id, name, phone, email, metadata')
    .single()
  if (error) throw error
  return { lead: created }
}

/**
 * Trouve une conversation native pour un (lead | branch) + inbox, ou en cree une.
 *
 * Anchor model post-migration 041: a conversation has either contact_id (real
 * customer) or branch_id (coordinator) or both (hybrid customer + coordinator).
 * The branch_id arg, if set, both indexes the conv lookup AND triggers the
 * ai_disabled / is_dispatch flags so the bot stays out of coordinator threads.
 */
async function findOrCreateConversation(supabase, userId, inboxId, { leadId = null, branchId = null }) {
  if (!leadId && !branchId) throw new Error('findOrCreateConversation requires leadId or branchId')

  // Lookup: prefer matching by branchId when present (coordinator dispatch
  // thread is per-branch, regardless of which lead is also linked); fall back
  // to leadId for pure customer threads.
  let lookup = supabase
    .from('chat_conversations')
    .select('id, status')
    .eq('user_id', userId)
    .eq('inbox_id', inboxId)
    .order('created_at', { ascending: false })
    .limit(1)
  lookup = branchId ? lookup.eq('branch_id', branchId) : lookup.eq('contact_id', leadId)
  const { data: existing } = await lookup.maybeSingle()
  if (existing) return existing

  const insert = {
    user_id: userId,
    inbox_id: inboxId,
    contact_id: leadId,
    branch_id: branchId,
    channel: 'whatsapp_unipile',
    status: 'open',
  }
  if (branchId) {
    insert.ai_disabled = true
    insert.metadata = { is_dispatch: true, branch_id: branchId }
  }

  const { data: created, error } = await supabase
    .from('chat_conversations')
    .insert(insert)
    .select('id, status')
    .single()
  if (error) throw error
  return created
}

/**
 * Telecharge un attachment depuis Unipile et l'upload dans le bucket
 * chat-attachments. Retourne l'objet a stocker dans chat_messages.attachments.
 */
async function persistAttachment(supabase, userId, conversationId, att) {
  const url = att.url || att.data_url
  if (!url) return null

  const { buffer, contentType } = await downloadAttachment(url)
  const fileName = att.file_name || att.name || 'attachment'
  const ext = fileName.includes('.') ? fileName.split('.').pop().toLowerCase() : 'bin'
  const safeName = fileName.replace(/[^\w.-]+/g, '_').slice(0, 80)
  const storagePath = `chat/${userId}/${conversationId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`

  const { error: upErr } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .upload(storagePath, buffer, { contentType, upsert: false })
  if (upErr) {
    console.error('[native-unipile] storage upload error:', upErr.message)
    return null
  }

  const { data: pub } = supabase.storage
    .from(ATTACHMENT_BUCKET)
    .getPublicUrl(storagePath)

  return {
    type: classifyAttachment(att),
    url: pub.publicUrl,
    storage_path: storagePath,
    content_type: contentType,
    file_name: fileName,
    size: buffer.length,
  }
}

/**
 * Entry point: traite un message Unipile entrant pour un chat_inbox natif.
 *
 * @param {object} args
 * @param {object} args.supabase - service-role client
 * @param {object} args.inbox    - { id, user_id }
 * @param {string} args.senderPhone
 * @param {string|null} args.senderName
 * @param {string} args.content
 * @param {Array}  [args.attachments=[]]
 * @param {object} [args.quoted]
 * @param {string} [args.externalId] - id Unipile du message (idempotence)
 */
export async function handleUnipileNativeInbound({
  supabase,
  inbox,
  senderPhone,
  senderName,
  content,
  attachments = [],
  quoted = null,
  externalId = null,
}) {
  if (!senderPhone) {
    console.log('[native-unipile] No sender phone, skipping')
    return
  }

  // Skip empty payloads (Unipile envoie parfois des status events sans content)
  if (!content && (!attachments || attachments.length === 0)) {
    console.log('[native-unipile] Empty payload (no content, no attachments) — skipping')
    return
  }

  // Debug: log la structure des attachments pour diagnostiquer les voice messages
  if (attachments && attachments.length > 0) {
    console.log('[native-unipile] Inbound attachments:', JSON.stringify(attachments.map(a => ({
      type: a.type, content_type: a.content_type, mime_type: a.mime_type,
      file_name: a.file_name || a.name,
      url: a.url ? a.url.slice(0, 60) + '...' : null,
      data_url: a.data_url ? a.data_url.slice(0, 60) + '...' : null,
    }))))
  }

  // 0. Idempotence: si on a deja inserre ce message externe, skip
  if (externalId) {
    const { data: dup } = await supabase
      .from('chat_messages')
      .select('id')
      .eq('external_id', externalId)
      .limit(1)
      .maybeSingle()
    if (dup) {
      console.log(`[native-unipile] Duplicate external_id=${externalId}, skipping`)
      return
    }
  }

  // 1. Resolve sender → lead (real customer) or branch (coordinator) or both.
  // resolveContact handles all three cases including the hybrid Aaron-style
  // case where one phone is both a real customer and a registered coordinator.
  const resolved = await resolveContact(supabase, inbox.user_id, senderPhone, senderName)
  const lead = resolved.lead || null
  const branch = resolved.branch || null

  // 2. Conversation — branch_id wins as the routing key when set (so a
  // coordinator's reply lands on the dispatch thread, not on a customer thread
  // for the same person).
  const conv = await findOrCreateConversation(supabase, inbox.user_id, inbox.id, {
    leadId: branch ? null : lead?.id, // pure-branch conv has no contact_id
    branchId: branch?.id || null,
  })

  // 3. Attachments (download + upload to Supabase Storage)
  const persistedAttachments = []
  let firstAudio = null
  for (const att of attachments) {
    if (!firstAudio && isAudioAttachment(att)) firstAudio = att
    try {
      const persisted = await persistAttachment(supabase, inbox.user_id, conv.id, att)
      if (persisted) persistedAttachments.push(persisted)
    } catch (err) {
      console.error('[native-unipile] attachment persist failed:', err.message)
    }
  }

  // 4. Transcription audio (Whisper) si vocal sans texte
  let finalContent = content || ''
  if (quoted?.message) {
    finalContent = `> ${quoted.message}\n\n${finalContent}`.trim()
  }
  let transcribed = false
  if (firstAudio && !finalContent) {
    try {
      const { transcription } = await transcribeAudio(firstAudio.url || firstAudio.data_url)
      finalContent = `🎤 ${transcription}`
      transcribed = true
      console.log(`[native-unipile] Voice transcribed: "${transcription.slice(0, 100)}"`)
    } catch (err) {
      console.error('[native-unipile] Whisper failed:', err.message)
      finalContent = '🎤 [message vocal]'
    }
  }

  // 5. Skip insert if everything ended up empty (eg Unipile event with attachments
  // qui ont tous echoue au download + pas de transcription audio). Le guard initial
  // (l.188) ne couvre que le cas content+attachments tous deux absents AVANT le
  // download — si attachments etait non vide mais persistAttachment a renvoye null
  // pour chacun, on aurait insere un message contact totalement vide. Resultat
  // observe: handleNativeMessage skip car userMessage vide -> faux "lead bloque
  // sans reponse" dans l'UI.
  if (!finalContent && persistedAttachments.length === 0 && !transcribed) {
    console.log(`[native-unipile] Empty after attachment processing (ext=${externalId}) — skipping insert`)
    return
  }

  // 6. Determine content_type for the message row
  let contentType = 'text'
  if (persistedAttachments.length > 0) {
    contentType = persistedAttachments[0].type === 'audio' ? 'audio'
      : persistedAttachments[0].type === 'image' ? 'image'
      : persistedAttachments[0].type === 'video' ? 'video'
      : 'file'
  }

  // 7. INSERT chat_messages (sender_type='contact'). For coordinator replies
  // on a pure-branch conv, contact_id is null and branch_id carries the anchor.
  // The chk_sender_ref CHECK (post-migration 041) accepts either.
  const { data: msg, error: msgErr } = await supabase
    .from('chat_messages')
    .insert({
      conversation_id: conv.id,
      user_id: inbox.user_id,
      sender_type: 'contact',
      contact_id: branch ? null : lead?.id || null,
      branch_id: branch?.id || null,
      content_type: contentType,
      content: finalContent,
      attachments: persistedAttachments,
      external_id: externalId,
      delivery_status: 'delivered',
      metadata: transcribed
        ? { transcription_source: 'whisper-1', voice: true }
        : {},
    })
    .select('id, conversation_id')
    .single()

  if (msgErr) {
    console.error('[native-unipile] insert chat_messages error:', msgErr.message)
    return
  }

  console.log(`[native-unipile] Inserted message ${msg.id} on conv ${conv.id}`)

  // 8. Trigger AI (handleNativeMessage)
  handleNativeMessage(supabase, conv.id, msg.id).catch(err => {
    console.error('[native-unipile] handleNativeMessage error:', err.message)
  })
}
