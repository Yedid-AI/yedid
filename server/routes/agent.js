import { Router } from 'express'
import { checkApiKey, checkWebhookSecret } from '../middleware.js'
import { provisionAccount } from '../chatwoot.js'
import { checkAuth, checkRole } from '../middleware.js'
import { handleWebhook } from '../engine/index.js'

const router = Router()

// POST /api/webhook/chatwoot — receives Chatwoot agent_bot webhooks
// Responds 200 immediately, processes async (fire-and-forget)
// Protected by optional WEBHOOK_SECRET verification
router.post('/webhook/chatwoot', checkWebhookSecret, (req, res) => {
  res.status(200).json({ ok: true })

  // Process asynchronously — don't await
  const supabase = req.supabaseAdmin || req.supabase
  handleWebhook(req.body, supabase).catch(err => {
    console.error('[Webhook] Error processing:', err.message)
  })
})

// GET /api/agent/config (authenticated via API key - called by n8n)
// Supports: ?chatwoot_account_id=X or ?inbox_id=X
router.get('/agent/config', checkApiKey, async (req, res) => {
  try {
    const { chatwoot_account_id, inbox_id } = req.query

    let agentBotId = null
    let userId = null

    if (inbox_id) {
      // Lookup via inbox_id → agent_bot_id → agent config
      const { data: inboxes, error: inError } = await req.supabase
        .from('inboxes')
        .select('user_id, agent_bot_id')
        .eq('inbox_id', parseInt(inbox_id))
        .limit(1)

      if (inError) throw inError
      if (!inboxes || inboxes.length === 0) {
        return res.status(404).json({ error: 'Inbox introuvable' })
      }

      userId = inboxes[0].user_id
      agentBotId = inboxes[0].agent_bot_id
    } else if (chatwoot_account_id) {
      // Legacy: lookup via chatwoot_account_id
      const { data: accounts, error: accError } = await req.supabase
        .from('chatwoot_accounts')
        .select('user_id')
        .eq('account_id', parseInt(chatwoot_account_id))
        .limit(1)

      if (accError) throw accError
      if (!accounts || accounts.length === 0) {
        return res.status(404).json({ error: 'Utilisateur introuvable pour ce compte Chatwoot' })
      }

      userId = accounts[0].user_id

      // Try to find the first agent_bot for this user
      const { data: bots } = await req.supabase
        .from('agent_bots')
        .select('id')
        .eq('user_id', userId)
        .eq('is_active', true)
        .limit(1)

      if (bots && bots.length > 0) {
        agentBotId = bots[0].id
      }
    } else {
      return res.status(400).json({ error: 'chatwoot_account_id ou inbox_id requis' })
    }

    // Fetch agent_bot (bot_token) + agent_config
    let agentConfig = null
    let botToken = null
    if (agentBotId) {
      const { data: bots } = await req.supabase
        .from('agent_bots')
        .select('bot_token')
        .eq('id', agentBotId)
        .limit(1)

      if (bots && bots.length > 0) {
        botToken = bots[0].bot_token
      }

      const { data: configs } = await req.supabase
        .from('agent_config')
        .select('*')
        .eq('agent_bot_id', agentBotId)
        .limit(1)

      if (configs && configs.length > 0) {
        agentConfig = configs[0]
      }
    }

    // Fetch chatwoot_user_id for escalation assignment
    let chatwootUserId = null
    if (userId) {
      const { data: cwAccounts } = await req.supabase
        .from('chatwoot_accounts')
        .select('chatwoot_user_id')
        .eq('user_id', userId)
        .limit(1)

      if (cwAccounts && cwAccounts.length > 0) {
        chatwootUserId = cwAccounts[0].chatwoot_user_id
      }
    }

    // Fetch playbooks scoped by agent_bot or user
    let playbooksQuery = req.supabase
      .from('playbooks')
      .select('id, title, content, audience, rules, is_active, tools(id, name, description, method, url, query_parameters, headers, body_schema)')
      .eq('is_active', true)

    if (agentBotId) {
      playbooksQuery = playbooksQuery.eq('agent_bot_id', agentBotId)
    } else {
      playbooksQuery = playbooksQuery.eq('user_id', userId)
    }

    const { data: playbooks, error: pbError } = await playbooksQuery
    if (pbError) throw pbError

    // Fetch escalation rules scoped by agent_bot or user
    let escalationQuery = req.supabase
      .from('escalation_rules')
      .select('*')
      .eq('is_active', true)

    if (agentBotId) {
      escalationQuery = escalationQuery.eq('agent_bot_id', agentBotId)
    } else {
      escalationQuery = escalationQuery.eq('user_id', userId)
    }

    const { data: escalation_rules, error: erError } = await escalationQuery
    if (erError) throw erError

    // Format playbooks
    const formattedPlaybooks = (playbooks || []).map((pb) => ({
      id: pb.id,
      title: pb.title,
      content: pb.content,
      audience: pb.audience,
      rules: pb.rules,
      tool: pb.tools || null,
    }))

    res.json({
      user_id: userId,
      bot_token: botToken,
      chatwoot_user_id: chatwootUserId,
      agent_config: agentConfig,
      playbooks: formattedPlaybooks,
      escalation_rules: escalation_rules || [],
    })
  } catch (err) {
    console.error('[agent/config]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// POST /api/agent/sessions (API key - called by n8n to create/find sessions)
router.post('/agent/sessions', checkApiKey, async (req, res) => {
  try {
    const { user_id, inbox_id, chatwoot_account_id, chatwoot_inbox_id, chatwoot_conversation_id } = req.body
    if (!user_id || !chatwoot_conversation_id) {
      return res.status(400).json({ error: 'user_id et chatwoot_conversation_id requis' })
    }

    // Check if session already exists for this conversation
    const { data: existing } = await req.supabase
      .from('sessions')
      .select('id')
      .eq('chatwoot_conversation_id', chatwoot_conversation_id)
      .eq('user_id', user_id)
      .eq('status', 'open')
      .limit(1)

    if (existing && existing.length > 0) {
      return res.json({ session: existing[0], created: false })
    }

    // Create new session
    const { data: session, error } = await req.supabase
      .from('sessions')
      .insert({
        user_id,
        inbox_id: inbox_id || null,
        chatwoot_account_id: chatwoot_account_id || null,
        chatwoot_inbox_id: chatwoot_inbox_id || null,
        chatwoot_conversation_id,
        status: 'open',
      })
      .select()
      .single()

    if (error) throw error
    res.json({ session, created: true })
  } catch (err) {
    console.error('[agent/sessions]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// PUT /api/agent/sessions/:id (API key - update session status)
router.put('/agent/sessions/:id', checkApiKey, async (req, res) => {
  try {
    const { id } = req.params
    const updates = {}
    const allowed = ['status', 'billable', 'ai_reason', 'ai_confidence', 'closed_at']
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key]
    }

    const { data: session, error } = await req.supabase
      .from('sessions')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    res.json({ session })
  } catch (err) {
    console.error('[agent/sessions/:id]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// POST /api/agent/messages (API key - called by n8n to log conversation messages)
router.post('/agent/messages', checkApiKey, async (req, res) => {
  try {
    const { session_id, user_id, role, content, playbook_id, escalation_id, metadata } = req.body
    if (!session_id || !user_id || !role || !content) {
      return res.status(400).json({ error: 'session_id, user_id, role et content requis' })
    }

    const { data: message, error } = await req.supabase
      .from('conversation_messages')
      .insert({
        session_id,
        user_id,
        role,
        content,
        playbook_id: playbook_id || null,
        escalation_id: escalation_id || null,
        metadata: metadata || null,
      })
      .select()
      .single()

    if (error) throw error
    res.json({ message })
  } catch (err) {
    console.error('[agent/messages]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// POST /api/provision-chat (super_admin only - provisions Chatwoot account for a user)
router.post('/provision-chat', checkAuth, checkRole('super_admin'), async (req, res) => {
  try {
    const { user_id } = req.body
    if (!user_id) {
      return res.status(400).json({ error: 'user_id requis' })
    }

    // Get target user
    const { data: users, error: fetchError } = await req.supabase
      .from('users')
      .select('*')
      .eq('id', user_id)
      .limit(1)

    if (fetchError) throw fetchError
    if (!users || users.length === 0) {
      return res.status(404).json({ error: 'Utilisateur introuvable' })
    }

    const targetUser = users[0]

    // Check if already provisioned
    const { data: existing } = await req.supabase
      .from('chatwoot_accounts')
      .select('id')
      .eq('user_id', targetUser.id)
      .limit(1)
    if (existing && existing.length > 0) {
      return res.status(400).json({ error: 'Chatwoot deja provisionne pour cet utilisateur' })
    }

    const supabase = req.supabaseAdmin || req.supabase
    const result = await provisionAccount(targetUser, supabase)

    res.json({ success: true, chatwoot: result })
  } catch (err) {
    console.error('[provision-chat]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

export default router
