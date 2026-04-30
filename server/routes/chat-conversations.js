import { Router } from 'express'
import { checkRole } from '../middleware.js'

const router = Router()

// Lead = contact dans yedid. Selection des colonnes utiles pour la UI.
const LEADS_SELECT = 'id, name, phone, email, city, company, type, status, branch, source, metadata'
const AGENT_SELECT = 'id, email, role'

// GET /api/chat/conversations
router.get('/chat/conversations', checkRole('admin', 'agent'), async (req, res) => {
  try {
    const { status, channel, assigned_agent_id, search, inbox_id, contact_id } = req.query
    const limit = Math.max(1, Math.min(parseInt(req.query.limit) || 50, 200))
    const offset = Math.max(0, parseInt(req.query.offset) || 0)

    let query = req.supabaseAdmin
      .from('chat_conversations')
      .select(`
        *,
        leads:contact_id (${LEADS_SELECT}),
        agent:assigned_agent_id (${AGENT_SELECT})
      `, { count: 'exact' })
      .eq('user_id', req.user.user_id)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1)

    if (status) query = query.eq('status', status)
    if (channel) query = query.eq('channel', channel)
    if (assigned_agent_id) query = query.eq('assigned_agent_id', assigned_agent_id)
    if (inbox_id) query = query.eq('inbox_id', inbox_id)
    if (contact_id) query = query.eq('contact_id', contact_id)

    if (search) {
      const term = `%${search}%`
      const { data: matchingLeads } = await req.supabaseAdmin
        .from('leads')
        .select('id')
        .eq('user_id', req.user.user_id)
        .or(`name.ilike.${term},phone.ilike.${term},email.ilike.${term}`)
        .limit(200)

      const leadIds = (matchingLeads || []).map(l => l.id)
      if (leadIds.length > 0) {
        query = query.or(`subject.ilike.${term},contact_id.in.(${leadIds.join(',')})`)
      } else {
        query = query.ilike('subject', term)
      }
    }

    const { data, error } = await query
    if (error) throw error

    const convIds = (data || []).map(c => c.id)
    const lastMessages = {}
    if (convIds.length > 0) {
      const { data: msgs } = await req.supabaseAdmin
        .from('chat_messages')
        .select('conversation_id, content, sender_type, content_type, created_at')
        .in('conversation_id', convIds)
        .eq('is_private', false)
        .order('created_at', { ascending: false })
        .limit(convIds.length * 3)
      for (const m of msgs || []) {
        if (!lastMessages[m.conversation_id]) lastMessages[m.conversation_id] = m
      }
    }

    const conversations = (data || []).map(c => ({
      ...c,
      last_message: lastMessages[c.id] || null,
    }))

    res.json({ conversations, total: conversations.length })
  } catch (err) {
    console.error('[chat-conversations]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// GET /api/chat/conversations/:id
router.get('/chat/conversations/:id', checkRole('admin', 'agent'), async (req, res) => {
  try {
    const { data, error } = await req.supabaseAdmin
      .from('chat_conversations')
      .select(`
        *,
        leads:contact_id (${LEADS_SELECT}),
        agent:assigned_agent_id (${AGENT_SELECT}),
        chat_inboxes (id, name, channel_type, config)
      `)
      .eq('id', req.params.id)
      .eq('user_id', req.user.user_id)
      .single()

    if (error) throw error
    if (!data) return res.status(404).json({ error: 'Conversation introuvable' })

    res.json({ conversation: data })
  } catch (err) {
    console.error('[chat-conversations]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// POST /api/chat/conversations
router.post('/chat/conversations', checkRole('admin', 'agent'), async (req, res) => {
  try {
    const { contact_id, channel, subject, assigned_agent_id, priority, inbox_id } = req.body || {}
    if (!contact_id) return res.status(400).json({ error: 'contact_id requis' })

    const { data: lead } = await req.supabaseAdmin
      .from('leads')
      .select('id, phone, email')
      .eq('id', contact_id)
      .eq('user_id', req.user.user_id)
      .single()
    if (!lead) return res.status(404).json({ error: 'Lead introuvable' })

    const insertData = {
      user_id: req.user.user_id,
      contact_id,
      channel: channel || 'website',
    }

    if (inbox_id) {
      const { data: inbox } = await req.supabaseAdmin
        .from('chat_inboxes')
        .select('id, channel_type')
        .eq('id', inbox_id)
        .eq('user_id', req.user.user_id)
        .single()
      if (!inbox) return res.status(404).json({ error: 'Inbox introuvable' })

      insertData.inbox_id = inbox_id
      insertData.channel = inbox.channel_type

      if (inbox.channel_type.startsWith('whatsapp_') && !lead.phone) {
        return res.status(400).json({ error: 'Lead sans téléphone (requis pour WhatsApp)' })
      }
      if (inbox.channel_type === 'gmail' && !lead.email) {
        return res.status(400).json({ error: 'Lead sans email' })
      }
    }

    if (subject) insertData.subject = subject
    if (assigned_agent_id) insertData.assigned_agent_id = assigned_agent_id
    if (priority) insertData.priority = priority

    const { data, error } = await req.supabaseAdmin
      .from('chat_conversations')
      .insert(insertData)
      .select(`*, leads:contact_id (${LEADS_SELECT}), agent:assigned_agent_id (${AGENT_SELECT})`)
      .single()

    if (error) throw error
    res.status(201).json({ conversation: data })
  } catch (err) {
    console.error('[chat-conversations]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// PUT /api/chat/conversations/:id
router.put('/chat/conversations/:id', checkRole('admin', 'agent'), async (req, res) => {
  try {
    const updates = { updated_at: new Date().toISOString() }
    const allowed = ['status', 'priority', 'subject', 'metadata', 'ai_disabled']
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key]
    }

    const { data, error } = await req.supabaseAdmin
      .from('chat_conversations')
      .update(updates)
      .eq('id', req.params.id)
      .eq('user_id', req.user.user_id)
      .select('*')
      .single()

    if (error) throw error
    if (!data) return res.status(404).json({ error: 'Conversation introuvable' })
    res.json({ conversation: data })
  } catch (err) {
    console.error('[chat-conversations]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// PUT /api/chat/conversations/:id/assign
router.put('/chat/conversations/:id/assign', checkRole('admin', 'agent'), async (req, res) => {
  try {
    const { agent_id } = req.body || {}

    if (agent_id) {
      const { data: agent } = await req.supabaseAdmin
        .from('users')
        .select('id')
        .eq('id', agent_id)
        .single()
      if (!agent) return res.status(404).json({ error: 'Agent introuvable' })
    }

    const { data, error } = await req.supabaseAdmin
      .from('chat_conversations')
      .update({
        assigned_agent_id: agent_id || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .eq('user_id', req.user.user_id)
      .select('*')
      .single()

    if (error) throw error
    if (!data) return res.status(404).json({ error: 'Conversation introuvable' })
    res.json({ conversation: data })
  } catch (err) {
    console.error('[chat-conversations/assign]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// PUT /api/chat/conversations/:id/resolve
router.put('/chat/conversations/:id/resolve', checkRole('admin', 'agent'), async (req, res) => {
  try {
    const now = new Date().toISOString()
    const { data, error } = await req.supabaseAdmin
      .from('chat_conversations')
      .update({ status: 'resolved', resolved_at: now, updated_at: now })
      .eq('id', req.params.id)
      .eq('user_id', req.user.user_id)
      .select('*')
      .single()

    if (error) throw error
    if (!data) return res.status(404).json({ error: 'Conversation introuvable' })
    res.json({ conversation: data })
  } catch (err) {
    console.error('[chat-conversations/resolve]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// PUT /api/chat/conversations/:id/snooze
router.put('/chat/conversations/:id/snooze', checkRole('admin', 'agent'), async (req, res) => {
  try {
    const { snoozed_until } = req.body || {}
    if (!snoozed_until) return res.status(400).json({ error: 'snoozed_until requis' })

    const { data, error } = await req.supabaseAdmin
      .from('chat_conversations')
      .update({
        status: 'snoozed',
        snoozed_until,
        updated_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .eq('user_id', req.user.user_id)
      .select('*')
      .single()

    if (error) throw error
    if (!data) return res.status(404).json({ error: 'Conversation introuvable' })
    res.json({ conversation: data })
  } catch (err) {
    console.error('[chat-conversations/snooze]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// PUT /api/chat/conversations/:id/toggle-ai
router.put('/chat/conversations/:id/toggle-ai', checkRole('admin', 'agent'), async (req, res) => {
  try {
    const { data: current } = await req.supabaseAdmin
      .from('chat_conversations')
      .select('ai_disabled')
      .eq('id', req.params.id)
      .eq('user_id', req.user.user_id)
      .single()

    if (!current) return res.status(404).json({ error: 'Conversation introuvable' })

    const { data, error } = await req.supabaseAdmin
      .from('chat_conversations')
      .update({
        ai_disabled: !current.ai_disabled,
        updated_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .eq('user_id', req.user.user_id)
      .select('id, ai_disabled')
      .single()

    if (error) throw error
    res.json({ conversation: data })
  } catch (err) {
    console.error('[chat-conversations/toggle-ai]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// PUT /api/chat/conversations/:id/read
router.put('/chat/conversations/:id/read', checkRole('admin', 'agent'), async (req, res) => {
  try {
    const { data, error } = await req.supabaseAdmin
      .from('chat_conversations')
      .update({ unread_count: 0, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('user_id', req.user.user_id)
      .select('id, unread_count')
      .single()

    if (error) throw error
    if (!data) return res.status(404).json({ error: 'Conversation introuvable' })
    res.json({ conversation: data })
  } catch (err) {
    console.error('[chat-conversations/read]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// GET /api/chat/unread-count
router.get('/chat/unread-count', checkRole('admin', 'agent'), async (req, res) => {
  try {
    const { data, error } = await req.supabaseAdmin
      .from('chat_conversations')
      .select('unread_count')
      .eq('user_id', req.user.user_id)
      .in('status', ['open', 'pending'])

    if (error) throw error
    const total = (data || []).reduce((sum, c) => sum + (c.unread_count || 0), 0)
    res.json({ count: total })
  } catch (err) {
    console.error('[chat/unread-count]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

export default router
