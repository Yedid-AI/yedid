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
 * Trouve un lead par telephone pour un user, ou en cree un nouveau.
 *
 * Side effect: if the phone matches an active branch (mobile or whatsapp_phone),
 * stamp `metadata.is_branch=true` + `metadata.branch_id` on the lead. This is
 * what `handleNativeMessage`'s branch guard reads to skip the AI — without it,
 * a coordinator writing inbound for the first time gets Shira treating them
 * as a customer.
 */
async function findOrCreateLead(supabase, userId, phone, name) {
  const normalizedPhone = phone.startsWith('+') ? phone : `+${phone}`

  // Try with the +-prefixed form, then without
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

  // If we found an existing lead and it's not already tagged as branch,
  // check `branches` and stamp it. Cheap (single row by phone) and idempotent.
  if (lead && !lead.metadata?.is_branch) {
    const branch = await lookupBranchByPhone(supabase, normalizedPhone)
    if (branch) {
      const newMeta = { ...(lead.metadata || {}), is_branch: true, branch_id: branch.id }
      await supabase.from('leads').update({ metadata: newMeta }).eq('id', lead.id)
      lead.metadata = newMeta
      console.log(`[native-unipile] Lead ${lead.id} flagged as branch (${branch.name}) on inbound`)
    }
  }

  if (lead) return lead

  // Create lead — minimal fields. NEVER fall back to name=phone: the AI's
  // contactContext now treats name=phone as "no name" so the bot will ask for
  // it, but storing the placeholder also pollutes the leads list UI ("contacts"
  // become a wall of phone numbers). leads.name is NOT NULL → use '' (UI shows
  // '—' fallback) and let the AI fill in the real name on the first turn.
  const cleanName = (name || '').trim()
  const finalName = cleanName && cleanName !== normalizedPhone && cleanName !== normalizedPhone.replace(/^\+/, '')
    ? cleanName : ''

  // Same lookup as the existing-lead path, applied at creation time so brand-new
  // contacts who happen to be branch coordinators are tagged from row 1.
  const branchAtCreate = await lookupBranchByPhone(supabase, normalizedPhone)
  const initialMeta = branchAtCreate
    ? { is_branch: true, branch_id: branchAtCreate.id }
    : null

  const { data: created, error } = await supabase
    .from('leads')
    .insert({
      user_id: userId,
      name: finalName,
      phone: normalizedPhone,
      source: 'whatsapp_native',
      lead_channel: 'whatsapp',
      status: 'new',
      metadata: initialMeta,
    })
    .select('id, name, phone, email, metadata')
    .single()
  if (error) throw error
  return created
}

/**
 * Trouve une conversation native ouverte/pending pour un lead+inbox,
 * ou en cree une nouvelle.
 *
 * Si le lead est un branch lead (metadata.is_branch=true), la nouvelle
 * conversation est creee avec ai_disabled=true + metadata.is_dispatch=true.
 * Sans ca, un coordinateur de branche qui ecrit inbound (avant qu'un dispatch
 * vers lui ait deja cree la conv) declenche Shira -> spam d'un humain non-client.
 */
async function findOrCreateConversation(supabase, userId, inboxId, leadId) {
  const { data: existing } = await supabase
    .from('chat_conversations')
    .select('id, status')
    .eq('user_id', userId)
    .eq('inbox_id', inboxId)
    .eq('contact_id', leadId)
    .in('status', ['open', 'pending'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing) return existing

  // Inspect the lead to see if it's a branch coordinator — if so, mute the AI
  // on the brand-new conversation. Cheap (single-row by id) and fail-open if
  // the lookup errors (creation still proceeds with default flags).
  let isBranchLead = false
  let branchIdForMeta = null
  try {
    const { data: lead } = await supabase
      .from('leads')
      .select('metadata')
      .eq('id', leadId)
      .maybeSingle()
    if (lead?.metadata?.is_branch) {
      isBranchLead = true
      branchIdForMeta = lead.metadata?.branch_id || null
    }
  } catch (err) {
    console.error('[native-unipile] branch-lead probe failed:', err.message)
  }

  const insert = {
    user_id: userId,
    inbox_id: inboxId,
    contact_id: leadId,
    channel: 'whatsapp_unipile',
    status: 'open',
  }
  if (isBranchLead) {
    insert.ai_disabled = true
    insert.metadata = { is_dispatch: true, branch_id: branchIdForMeta }
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

  // 1. Lead = contact
  const lead = await findOrCreateLead(supabase, inbox.user_id, senderPhone, senderName)

  // 2. Conversation
  const conv = await findOrCreateConversation(supabase, inbox.user_id, inbox.id, lead.id)

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

  // 7. INSERT chat_messages (sender_type='contact')
  const { data: msg, error: msgErr } = await supabase
    .from('chat_messages')
    .insert({
      conversation_id: conv.id,
      user_id: inbox.user_id,
      sender_type: 'contact',
      contact_id: lead.id,
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
