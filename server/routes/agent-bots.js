import { Router } from 'express'
import { checkRole } from '../middleware.js'
import { createAgentBot } from '../chatwoot.js'
import { getSetting } from '../settings.js'

const router = Router()

// GET /api/agent-bots
router.get('/agent-bots', checkRole('admin'), async (req, res) => {
  try {
    const { data, error } = await req.supabase
      .from('agent_bots')
      .select('*, agent_config(*)')
      .eq('user_id', req.user.user_id)
      .order('created_at', { ascending: false })

    if (error) throw error
    res.json({ agent_bots: data })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/agent-bots/:id
router.get('/agent-bots/:id', checkRole('admin'), async (req, res) => {
  try {
    const { id } = req.params
    const { data, error } = await req.supabase
      .from('agent_bots')
      .select('*, agent_config(*)')
      .eq('id', id)
      .eq('user_id', req.user.user_id)
      .single()

    if (error) throw error
    if (!data) return res.status(404).json({ error: 'Agent introuvable' })
    res.json({ agent_bot: data })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/agent-bots
router.post('/agent-bots', checkRole('admin'), async (req, res) => {
  try {
    const { name } = req.body
    if (!name) {
      return res.status(400).json({ error: 'Nom requis' })
    }

    // Get user's chatwoot account
    const { data: accounts } = await req.supabase
      .from('chatwoot_accounts')
      .select('account_id')
      .eq('user_id', req.user.user_id)
      .limit(1)

    if (!accounts || accounts.length === 0) {
      return res.status(400).json({ error: 'Compte Chatwoot requis. Contactez l\'administrateur.' })
    }

    const accountId = accounts[0].account_id
    const outgoingUrl = getSetting('N8N_AGENT_WEBHOOK_URL')

    // Create bot on Chatwoot
    let botId = null
    let botToken = null
    if (outgoingUrl) {
      const bot = await createAgentBot(accountId, name, outgoingUrl)
      botId = bot.id
      botToken = bot.access_token
    }

    // Insert agent_bot
    const supabase = req.supabaseAdmin || req.supabase
    const { data: agentBot, error } = await supabase
      .from('agent_bots')
      .insert({
        user_id: req.user.user_id,
        chatwoot_account_id: accountId,
        bot_id: botId,
        bot_token: botToken,
        name,
        outgoing_url: outgoingUrl || null,
      })
      .select()
      .single()

    if (error) throw error

    // Create default agent_config
    await supabase
      .from('agent_config')
      .insert({ agent_bot_id: agentBot.id, name })

    // Re-fetch with config
    const { data: full } = await supabase
      .from('agent_bots')
      .select('*, agent_config(*)')
      .eq('id', agentBot.id)
      .single()

    res.status(201).json({ agent_bot: full })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PUT /api/agent-bots/:id
router.put('/agent-bots/:id', checkRole('admin'), async (req, res) => {
  try {
    const { id } = req.params
    const { name, is_active } = req.body

    const updates = { updated_at: new Date().toISOString() }
    if (name !== undefined) updates.name = name
    if (is_active !== undefined) updates.is_active = is_active

    const { data, error } = await req.supabase
      .from('agent_bots')
      .update(updates)
      .eq('id', id)
      .eq('user_id', req.user.user_id)
      .select('*, agent_config(*)')
      .single()

    if (error) throw error
    res.json({ agent_bot: data })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PUT /api/agent-bots/:id/config
router.put('/agent-bots/:id/config', checkRole('admin'), async (req, res) => {
  try {
    const { id } = req.params

    // Verify ownership
    const { data: bot } = await req.supabase
      .from('agent_bots')
      .select('id')
      .eq('id', id)
      .eq('user_id', req.user.user_id)
      .single()

    if (!bot) return res.status(404).json({ error: 'Agent introuvable' })

    const { name, prompt, tone, response_length } = req.body
    const updates = { updated_at: new Date().toISOString() }
    if (name !== undefined) updates.name = name
    if (prompt !== undefined) updates.prompt = prompt
    if (tone !== undefined) updates.tone = tone
    if (response_length !== undefined) updates.response_length = response_length

    const { data, error } = await req.supabase
      .from('agent_config')
      .update(updates)
      .eq('agent_bot_id', id)
      .select()
      .single()

    if (error) throw error
    res.json({ config: data })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/agent-bots/:id
router.delete('/agent-bots/:id', checkRole('admin'), async (req, res) => {
  try {
    const { id } = req.params
    const { error } = await req.supabase
      .from('agent_bots')
      .delete()
      .eq('id', id)
      .eq('user_id', req.user.user_id)

    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
