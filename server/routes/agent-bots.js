import { Router } from 'express'
import { checkRole, verifyAgentOwner } from '../middleware.js'
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
    console.error('[agent-bots]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
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
    console.error('[agent-bots]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
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
    const appBaseUrl = getSetting('APP_BASE_URL')
    const outgoingUrl = appBaseUrl ? `${appBaseUrl}/api/webhook/chatwoot` : ''

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
    console.error('[agent-bots]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
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
    console.error('[agent-bots]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
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

    const ALLOWED_PROVIDERS = ['openai', 'anthropic']
    const ALLOWED_MODELS = {
      openai: ['gpt-4.1-mini', 'gpt-4.1', 'gpt-4o', 'gpt-4o-mini'],
      anthropic: ['claude-sonnet-4-20250514', 'claude-haiku-4-20250414'],
    }

    const { name, prompt, tone, response_length, llm_provider, llm_model } = req.body

    if (llm_provider !== undefined && !ALLOWED_PROVIDERS.includes(llm_provider)) {
      return res.status(400).json({ error: `Provider invalide. Valeurs acceptees: ${ALLOWED_PROVIDERS.join(', ')}` })
    }

    if (llm_model !== undefined) {
      const provider = llm_provider || 'openai'
      if (!ALLOWED_MODELS[provider]?.includes(llm_model)) {
        return res.status(400).json({ error: `Modele invalide pour ${provider}. Valeurs acceptees: ${(ALLOWED_MODELS[provider] || []).join(', ')}` })
      }
    }

    const updates = { updated_at: new Date().toISOString() }
    if (name !== undefined) updates.name = name
    if (prompt !== undefined) updates.prompt = prompt
    if (tone !== undefined) updates.tone = tone
    if (response_length !== undefined) updates.response_length = response_length
    if (llm_provider !== undefined) updates.llm_provider = llm_provider
    if (llm_model !== undefined) updates.llm_model = llm_model

    const { data, error } = await req.supabase
      .from('agent_config')
      .update(updates)
      .eq('agent_bot_id', id)
      .select()
      .single()

    if (error) throw error
    res.json({ config: data })
  } catch (err) {
    console.error('[agent-bots]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// ─── Agent ↔ Playbooks association ────────────────────────────

// GET /api/agent-bots/:id/playbooks — associated playbooks via junction
router.get('/agent-bots/:id/playbooks', checkRole('admin'), verifyAgentOwner, async (req, res) => {
  try {
    const { data, error } = await req.supabaseAdmin
      .from('agent_bot_playbooks')
      .select('playbook_id, playbooks(*, tools(id, name))')
      .eq('agent_bot_id', req.params.id)

    if (error) throw error
    const playbooks = (data || []).map(row => row.playbooks).filter(Boolean)
    res.json({ playbooks })
  } catch (err) {
    console.error('[agent-bots]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// PUT /api/agent-bots/:id/playbooks — replace all associations
router.put('/agent-bots/:id/playbooks', checkRole('admin'), verifyAgentOwner, async (req, res) => {
  try {
    const agentBotId = parseInt(req.params.id)
    const { playbook_ids } = req.body

    if (!Array.isArray(playbook_ids)) {
      return res.status(400).json({ error: 'playbook_ids doit etre un tableau' })
    }

    // Delete existing associations
    const { error: delError } = await req.supabaseAdmin
      .from('agent_bot_playbooks')
      .delete()
      .eq('agent_bot_id', agentBotId)

    if (delError) throw delError

    // Insert new associations
    if (playbook_ids.length > 0) {
      const inserts = playbook_ids.map(pbId => ({
        agent_bot_id: agentBotId,
        playbook_id: parseInt(pbId),
      }))

      const { error: insertError } = await req.supabaseAdmin
        .from('agent_bot_playbooks')
        .insert(inserts)

      if (insertError) throw insertError
    }

    res.json({ success: true })
  } catch (err) {
    console.error('[agent-bots]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// ─── Agent ↔ Escalation Rules association ─────────────────────

// GET /api/agent-bots/:id/escalation-rules — associated rules via junction
router.get('/agent-bots/:id/escalation-rules', checkRole('admin'), verifyAgentOwner, async (req, res) => {
  try {
    const { data, error } = await req.supabaseAdmin
      .from('agent_bot_escalation_rules')
      .select('escalation_rule_id, escalation_rules(*)')
      .eq('agent_bot_id', req.params.id)

    if (error) throw error
    const rules = (data || []).map(row => row.escalation_rules).filter(Boolean)
    res.json({ rules })
  } catch (err) {
    console.error('[agent-bots]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// PUT /api/agent-bots/:id/escalation-rules — replace all associations
router.put('/agent-bots/:id/escalation-rules', checkRole('admin'), verifyAgentOwner, async (req, res) => {
  try {
    const agentBotId = parseInt(req.params.id)
    const { escalation_rule_ids } = req.body

    if (!Array.isArray(escalation_rule_ids)) {
      return res.status(400).json({ error: 'escalation_rule_ids doit etre un tableau' })
    }

    // Delete existing associations
    const { error: delError } = await req.supabaseAdmin
      .from('agent_bot_escalation_rules')
      .delete()
      .eq('agent_bot_id', agentBotId)

    if (delError) throw delError

    // Insert new associations
    if (escalation_rule_ids.length > 0) {
      const inserts = escalation_rule_ids.map(erId => ({
        agent_bot_id: agentBotId,
        escalation_rule_id: parseInt(erId),
      }))

      const { error: insertError } = await req.supabaseAdmin
        .from('agent_bot_escalation_rules')
        .insert(inserts)

      if (insertError) throw insertError
    }

    res.json({ success: true })
  } catch (err) {
    console.error('[agent-bots]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
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
    console.error('[agent-bots]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

export default router
