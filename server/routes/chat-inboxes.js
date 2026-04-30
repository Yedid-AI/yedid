import { Router } from 'express'
import { checkRole } from '../middleware.js'
import { getAccount, createHostedAuthLink } from '../unipile.js'
import { getSetting } from '../settings.js'

const router = Router()

const SELECT_COLUMNS = `
  id, user_id, name, channel_type, agent_bot_id, config,
  greeting_message, is_active, ai_enabled, ai_schedule, ai_timezone,
  unipile_account_id, phone_number, widget_locale,
  last_sync_at, sync_status, created_at, updated_at,
  agent_bots(id, name, is_active)
`

// GET /api/chat/inboxes
router.get('/chat/inboxes', checkRole('admin'), async (req, res) => {
  try {
    const { data, error } = await req.supabaseAdmin
      .from('chat_inboxes')
      .select(SELECT_COLUMNS)
      .eq('user_id', req.user.user_id)
      .order('created_at', { ascending: false })

    if (error) throw error

    const inboxIds = (data || []).map(i => i.id)
    const convCounts = {}
    if (inboxIds.length > 0) {
      const { data: counts } = await req.supabaseAdmin
        .from('chat_conversations')
        .select('inbox_id')
        .in('inbox_id', inboxIds)
      for (const c of counts || []) {
        convCounts[c.inbox_id] = (convCounts[c.inbox_id] || 0) + 1
      }
    }

    res.json({
      inboxes: (data || []).map(i => ({ ...i, conversation_count: convCounts[i.id] || 0 })),
    })
  } catch (err) {
    console.error('[chat-inboxes]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// GET /api/chat/inboxes/:id
router.get('/chat/inboxes/:id', checkRole('admin'), async (req, res) => {
  try {
    const { data, error } = await req.supabaseAdmin
      .from('chat_inboxes')
      .select(SELECT_COLUMNS)
      .eq('id', req.params.id)
      .eq('user_id', req.user.user_id)
      .single()

    if (error) throw error
    if (!data) return res.status(404).json({ error: 'Inbox introuvable' })
    res.json({ inbox: data })
  } catch (err) {
    console.error('[chat-inboxes]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// POST /api/chat/inboxes
router.post('/chat/inboxes', checkRole('admin'), async (req, res) => {
  try {
    const { name, channel_type, agent_bot_id, config, greeting_message } = req.body || {}
    if (!name) return res.status(400).json({ error: 'name requis' })

    if (agent_bot_id) {
      const { data: bot } = await req.supabaseAdmin
        .from('agent_bots')
        .select('id')
        .eq('id', agent_bot_id)
        .eq('user_id', req.user.user_id)
        .limit(1)
      if (!bot || bot.length === 0) {
        return res.status(400).json({ error: 'Bot inconnu' })
      }
    }

    const insertData = {
      user_id: req.user.user_id,
      name,
      channel_type: channel_type || 'website',
    }
    if (agent_bot_id) insertData.agent_bot_id = agent_bot_id
    if (config) insertData.config = config
    if (greeting_message) insertData.greeting_message = greeting_message

    const { data, error } = await req.supabaseAdmin
      .from('chat_inboxes')
      .insert(insertData)
      .select(SELECT_COLUMNS)
      .single()

    if (error) throw error
    res.status(201).json({ inbox: data })
  } catch (err) {
    console.error('[chat-inboxes]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// PUT /api/chat/inboxes/:id
router.put('/chat/inboxes/:id', checkRole('admin'), async (req, res) => {
  try {
    const updates = { updated_at: new Date().toISOString() }
    const allowed = ['name', 'config', 'greeting_message', 'is_active', 'ai_enabled', 'ai_schedule', 'ai_timezone', 'unipile_account_id', 'phone_number', 'widget_locale']
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key]
    }

    const { data, error } = await req.supabaseAdmin
      .from('chat_inboxes')
      .update(updates)
      .eq('id', req.params.id)
      .eq('user_id', req.user.user_id)
      .select(SELECT_COLUMNS)
      .single()

    if (error) throw error
    if (!data) return res.status(404).json({ error: 'Inbox introuvable' })
    res.json({ inbox: data })
  } catch (err) {
    console.error('[chat-inboxes]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// PUT /api/chat/inboxes/:id/assign-bot
router.put('/chat/inboxes/:id/assign-bot', checkRole('admin'), async (req, res) => {
  try {
    const { agent_bot_id } = req.body || {}
    if (agent_bot_id) {
      const { data: bot } = await req.supabaseAdmin
        .from('agent_bots')
        .select('id')
        .eq('id', agent_bot_id)
        .eq('user_id', req.user.user_id)
        .limit(1)
      if (!bot || bot.length === 0) {
        return res.status(400).json({ error: 'Bot inconnu' })
      }
    }

    const { data, error } = await req.supabaseAdmin
      .from('chat_inboxes')
      .update({ agent_bot_id: agent_bot_id || null, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('user_id', req.user.user_id)
      .select(SELECT_COLUMNS)
      .single()

    if (error) throw error
    if (!data) return res.status(404).json({ error: 'Inbox introuvable' })
    res.json({ inbox: data })
  } catch (err) {
    console.error('[chat-inboxes]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// DELETE /api/chat/inboxes/:id
router.delete('/chat/inboxes/:id', checkRole('admin'), async (req, res) => {
  try {
    const { error } = await req.supabaseAdmin
      .from('chat_inboxes')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.user.user_id)
    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    console.error('[chat-inboxes]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// GET /api/chat/inboxes/:id/whatsapp-status (Unipile only)
router.get('/chat/inboxes/:id/whatsapp-status', checkRole('admin'), async (req, res) => {
  try {
    const { data: inbox } = await req.supabaseAdmin
      .from('chat_inboxes')
      .select('id, unipile_account_id, phone_number, channel_type')
      .eq('id', req.params.id)
      .eq('user_id', req.user.user_id)
      .single()

    if (!inbox) return res.status(404).json({ error: 'Inbox introuvable' })
    if (inbox.channel_type !== 'whatsapp_unipile') {
      return res.status(400).json({ error: 'Not a WhatsApp Unipile inbox' })
    }

    if (!inbox.unipile_account_id) {
      return res.json({ status: 'NOT_CONFIGURED', phone_number: null })
    }

    const account = await getAccount(inbox.unipile_account_id)
    const status = account?.status
      || account?.connection_status
      || account?.sources?.[0]?.status
      || 'UNKNOWN'
    const phone = account?.connection_params?.im?.phone_number
      || account?.phone_number
      || inbox.phone_number
      || ''

    res.json({ status, phone_number: phone })
  } catch (err) {
    console.error('[chat-inboxes/whatsapp-status]', err.message)
    res.json({ status: 'ERROR', phone_number: null })
  }
})

// POST /api/chat/inboxes/:id/whatsapp-reconnect
router.post('/chat/inboxes/:id/whatsapp-reconnect', checkRole('admin'), async (req, res) => {
  try {
    const { data: inbox } = await req.supabaseAdmin
      .from('chat_inboxes')
      .select('unipile_account_id, channel_type')
      .eq('id', req.params.id)
      .eq('user_id', req.user.user_id)
      .single()

    if (!inbox) return res.status(404).json({ error: 'Inbox introuvable' })
    if (inbox.channel_type !== 'whatsapp_unipile') {
      return res.status(400).json({ error: 'Not a WhatsApp Unipile inbox' })
    }
    if (!inbox.unipile_account_id) {
      return res.status(400).json({ error: 'No Unipile account configured' })
    }

    const appBaseUrl = getSetting('APP_BASE_URL')
    const result = await createHostedAuthLink({
      callbackUrl: `${appBaseUrl}/workspace?whatsapp=reconnected`,
      notifyUrl: `${appBaseUrl}/api/webhook/unipile/account`,
      name: String(req.user.user_id),
      reconnectAccountId: inbox.unipile_account_id,
    })

    res.json({ url: result.url })
  } catch (err) {
    console.error('[chat-inboxes/whatsapp-reconnect]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

export default router
