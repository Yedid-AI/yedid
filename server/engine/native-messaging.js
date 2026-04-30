/**
 * Native chat messaging — remplace chatwoot-messaging.js pour les
 * conversations natives. Insere directement dans chat_messages, et
 * relaie au canal externe (WhatsApp Unipile pour l'instant).
 *
 * Le trigger DB on_chat_new_message met a jour
 * conversation.last_message_at + unread_count automatiquement.
 */

import {
  sendMessage as unipileSendMessage,
  sendMessageWithAttachment as unipileSendMessageWithAttachment,
  downloadAttachment as unipileDownloadAttachment,
} from '../unipile.js'
import { generateTTS } from './voice.js'

/**
 * Envoie un message natif (agent ou bot).
 *
 * @param {object} args
 * @param {object} args.supabase     - service-role client
 * @param {number} args.userId       - tenant (BIGINT)
 * @param {string} args.conversationId
 * @param {'agent'|'bot'} args.senderType
 * @param {number|null} args.agentId - obligatoire si senderType='agent'
 * @param {string} args.content
 * @param {string} [args.contentType='text']
 * @param {Array}  [args.attachments=[]]
 * @param {object} [args.metadata={}]
 * @param {boolean}[args.isPrivate=false]
 * @returns {Promise<{message?:object, error?:string}>}
 */
export async function sendNativeMessage({
  supabase,
  userId,
  conversationId,
  senderType,
  agentId = null,
  content,
  contentType = 'text',
  attachments = [],
  metadata = {},
  isPrivate = false,
}) {
  // 1. Verify conversation belongs to user, and load channel info
  const { data: conv, error: convErr } = await supabase
    .from('chat_conversations')
    .select(`
      id, user_id, channel, contact_id, inbox_id,
      chat_inboxes (id, channel_type, unipile_account_id, phone_number)
    `)
    .eq('id', conversationId)
    .eq('user_id', userId)
    .single()
  if (convErr || !conv) return { error: 'Conversation introuvable' }

  // 2. Insert message
  const insertData = {
    conversation_id: conversationId,
    user_id: userId,
    sender_type: senderType,
    content_type: contentType,
    content,
    attachments,
    metadata,
    is_private: isPrivate,
  }
  if (senderType === 'agent') {
    if (!agentId) return { error: 'agentId requis pour sender_type=agent' }
    insertData.agent_id = agentId
  }

  const { data: msg, error: msgErr } = await supabase
    .from('chat_messages')
    .insert(insertData)
    .select('*')
    .single()

  if (msgErr) {
    console.error('[native-messaging] insert error:', msgErr.message)
    return { error: msgErr.message }
  }

  // 3. Relay to external channel (only for non-private outgoing messages)
  if (!isPrivate && (senderType === 'agent' || senderType === 'bot')) {
    relayToChannel(supabase, conv, msg, content).catch(err => {
      console.error('[native-messaging] relay error:', err.message)
    })
  }

  return { message: msg }
}

/**
 * Relais vers le canal externe selon le channel_type de l'inbox.
 * Async, fire-and-forget. En cas d'echec, le message reste persiste
 * cote DB; on UPDATE delivery_status='failed' pour tracking UI.
 *
 * @param {object} msg     - row chat_messages (avec metadata.tts_voice si TTS demande)
 */
async function relayToChannel(supabase, conv, msg, content) {
  const inbox = conv.chat_inboxes
  if (!inbox) return

  const { data: lead } = await supabase
    .from('leads')
    .select('phone, email')
    .eq('id', conv.contact_id)
    .single()
  if (!lead) return

  let delivered = false
  try {
    if (inbox.channel_type === 'whatsapp_unipile') {
      const accountId = inbox.unipile_account_id
      const phone = lead.phone
      if (!accountId || !phone) return

      // (a) TTS: si metadata.tts_voice (bot reply en mode vocal)
      if (msg.metadata?.tts_voice && content) {
        try {
          const { audioBuffer, contentType, fileName } = await generateTTS(content)
          await unipileSendMessageWithAttachment(accountId, phone, content, audioBuffer, fileName, contentType)
          delivered = true
        } catch (err) {
          console.warn('[native-messaging] TTS failed, fallback to text:', err.message)
          await unipileSendMessage(accountId, phone, content)
          delivered = true
        }
      }
      // (b) Attachments: relais multipart (un par un, avec le texte sur le 1er)
      else if (Array.isArray(msg.attachments) && msg.attachments.length > 0) {
        let textForFirst = content || ''
        for (const att of msg.attachments) {
          try {
            const { buffer, contentType } = await unipileDownloadAttachment(att.url)
            await unipileSendMessageWithAttachment(
              accountId,
              phone,
              textForFirst,
              buffer,
              att.file_name || 'attachment',
              att.content_type || contentType,
            )
            textForFirst = '' // texte uniquement sur le 1er
            delivered = true
          } catch (err) {
            console.error('[native-messaging] attachment relay failed:', err.message)
          }
        }
        // Texte restant si aucun attachment n'a marche
        if (textForFirst) {
          await unipileSendMessage(accountId, phone, textForFirst)
          delivered = true
        }
      }
      // (c) Texte simple
      else if (content) {
        await unipileSendMessage(accountId, phone, content)
        delivered = true
      }
    }
    // TODO: whatsapp_business_manual (Meta Cloud API)
    // TODO: gmail
    // 'website' et 'api' n'ont pas de relais externe (live in DB)
  } catch (err) {
    await supabase
      .from('chat_messages')
      .update({
        delivery_status: 'failed',
        metadata: { ...(msg.metadata || {}), relay_error: err.message },
      })
      .eq('id', msg.id)
    throw err
  }

  if (delivered) {
    await supabase
      .from('chat_messages')
      .update({ delivery_status: 'sent' })
      .eq('id', msg.id)
  }
}

/**
 * Assigne une conversation native a un user (agent humain).
 */
export async function assignNativeConversation(supabase, conversationId, agentUserId) {
  const { error } = await supabase
    .from('chat_conversations')
    .update({
      assigned_agent_id: agentUserId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversationId)
  if (error) throw error
}

/**
 * Note privee (visible agents seulement, pas relayee au canal).
 */
export async function sendNativePrivateNote({ supabase, userId, conversationId, agentId, content }) {
  return sendNativeMessage({
    supabase,
    userId,
    conversationId,
    senderType: 'agent',
    agentId,
    content,
    isPrivate: true,
  })
}

/**
 * Change le statut (open/pending/resolved/snoozed).
 */
export async function setNativeConversationStatus(supabase, conversationId, status) {
  const updates = { status, updated_at: new Date().toISOString() }
  if (status === 'resolved') updates.resolved_at = new Date().toISOString()

  const { error } = await supabase
    .from('chat_conversations')
    .update(updates)
    .eq('id', conversationId)
  if (error) throw error
}
