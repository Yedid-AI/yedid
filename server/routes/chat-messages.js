import { Router } from 'express'
import multer from 'multer'
import { checkRole } from '../middleware.js'
import { sendNativeMessage } from '../engine/native-messaging.js'

const router = Router()

const ATTACHMENT_BUCKET = 'chat-attachments'
const ALLOWED_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'video/mp4', 'video/quicktime', 'video/webm',
  'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/mp4', 'audio/webm',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain', 'text/csv',
]

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 16 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, ALLOWED_MIME_TYPES.includes(file.mimetype)),
})

function classifyContentType(mime, fileName = '') {
  const m = (mime || '').toLowerCase()
  const n = (fileName || '').toLowerCase()
  if (m.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(n)) return 'image'
  if (m.startsWith('video/') || /\.(mp4|mov|webm)$/i.test(n)) return 'video'
  if (m.startsWith('audio/') || /\.(ogg|opus|mp3|m4a|wav)$/i.test(n)) return 'audio'
  return 'file'
}

// GET /api/chat/conversations/:conversationId/messages
router.get('/chat/conversations/:conversationId/messages', checkRole('admin', 'agent'), async (req, res) => {
  try {
    const { before } = req.query
    const limit = Math.max(1, Math.min(parseInt(req.query.limit) || 50, 200))

    // Verify the conversation belongs to current user
    const { data: conv } = await req.supabaseAdmin
      .from('chat_conversations')
      .select('id')
      .eq('id', req.params.conversationId)
      .eq('user_id', req.user.user_id)
      .single()
    if (!conv) return res.status(404).json({ error: 'Conversation introuvable' })

    let query = req.supabaseAdmin
      .from('chat_messages')
      .select(`
        *,
        agent:agent_id (id, email, role),
        lead:contact_id (id, name, phone, email)
      `)
      .eq('conversation_id', req.params.conversationId)
      .eq('user_id', req.user.user_id)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (before) query = query.lt('created_at', before)

    const { data, error } = await query
    if (error) throw error
    res.json({ messages: (data || []).reverse() })
  } catch (err) {
    console.error('[chat-messages]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// POST /api/chat/conversations/:conversationId/messages
// sender_type='agent' → relayé vers le canal externe (WhatsApp/Email/etc.)
router.post('/chat/conversations/:conversationId/messages', checkRole('admin', 'agent'), async (req, res) => {
  try {
    const { content, content_type, attachments, metadata } = req.body || {}
    if (!content && !(attachments && attachments.length)) {
      return res.status(400).json({ error: 'content ou attachments requis' })
    }

    const result = await sendNativeMessage({
      supabase: req.supabaseAdmin,
      userId: req.user.user_id,
      conversationId: req.params.conversationId,
      senderType: 'agent',
      agentId: req.user.user_id,
      content: content || '',
      contentType: content_type || 'text',
      attachments: attachments || [],
      metadata: metadata || {},
    })

    if (result.error) return res.status(400).json({ error: result.error })
    res.status(201).json({ message: result.message })
  } catch (err) {
    console.error('[chat-messages]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// POST /api/chat/conversations/:conversationId/attachments
// multipart/form-data: file=<File>, content?=<string>, content_type?=<text|audio|image|video|file>
// Upload le fichier dans Supabase Storage puis envoie un chat_message qui sera relaye vers le canal externe.
router.post(
  '/chat/conversations/:conversationId/attachments',
  checkRole('admin', 'agent'),
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'file requis' })

      // Verify conversation belongs to user
      const { data: conv } = await req.supabaseAdmin
        .from('chat_conversations')
        .select('id')
        .eq('id', req.params.conversationId)
        .eq('user_id', req.user.user_id)
        .single()
      if (!conv) return res.status(404).json({ error: 'Conversation introuvable' })

      // Upload to Supabase Storage
      const fileName = req.file.originalname || 'attachment'
      const safeName = fileName.replace(/[^\w.-]+/g, '_').slice(0, 80)
      const storagePath = `chat/${req.user.user_id}/${req.params.conversationId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`

      const { error: upErr } = await req.supabaseAdmin.storage
        .from(ATTACHMENT_BUCKET)
        .upload(storagePath, req.file.buffer, { contentType: req.file.mimetype, upsert: false })
      if (upErr) {
        console.error('[chat-messages/attachments] upload error:', upErr.message)
        return res.status(500).json({ error: 'Upload echoue' })
      }
      const { data: pub } = req.supabaseAdmin.storage
        .from(ATTACHMENT_BUCKET)
        .getPublicUrl(storagePath)

      const attachment = {
        type: classifyContentType(req.file.mimetype, fileName),
        url: pub.publicUrl,
        storage_path: storagePath,
        content_type: req.file.mimetype,
        file_name: fileName,
        size: req.file.size,
      }

      // Send the message with the attachment (relay handled by sendNativeMessage)
      const result = await sendNativeMessage({
        supabase: req.supabaseAdmin,
        userId: req.user.user_id,
        conversationId: req.params.conversationId,
        senderType: 'agent',
        agentId: req.user.user_id,
        content: req.body?.content || '',
        contentType: req.body?.content_type || attachment.type,
        attachments: [attachment],
        metadata: {},
      })

      if (result.error) return res.status(400).json({ error: result.error })
      res.status(201).json({ message: result.message })
    } catch (err) {
      console.error('[chat-messages/attachments]', err.message)
      res.status(500).json({ error: 'Erreur interne' })
    }
  }
)

// POST /api/chat/conversations/:conversationId/notes — note privée (visible agents seulement)
router.post('/chat/conversations/:conversationId/notes', checkRole('admin', 'agent'), async (req, res) => {
  try {
    const { content } = req.body || {}
    if (!content) return res.status(400).json({ error: 'content requis' })

    const { data: conv } = await req.supabaseAdmin
      .from('chat_conversations')
      .select('id')
      .eq('id', req.params.conversationId)
      .eq('user_id', req.user.user_id)
      .single()
    if (!conv) return res.status(404).json({ error: 'Conversation introuvable' })

    const { data, error } = await req.supabaseAdmin
      .from('chat_messages')
      .insert({
        conversation_id: req.params.conversationId,
        user_id: req.user.user_id,
        sender_type: 'agent',
        agent_id: req.user.user_id,
        content_type: 'text',
        content,
        is_private: true,
      })
      .select('*')
      .single()

    if (error) throw error
    res.status(201).json({ message: data })
  } catch (err) {
    console.error('[chat-messages/notes]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

export default router
