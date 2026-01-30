import { Router } from 'express'
import { checkRole, verifyAgentOwner } from '../middleware.js'

const router = Router()

// GET /api/agent-bots/:agentBotId/escalation-rules
router.get('/agent-bots/:agentBotId/escalation-rules', checkRole('admin'), verifyAgentOwner, async (req, res) => {
  try {
    const { data, error } = await req.supabase
      .from('escalation_rules')
      .select('*')
      .eq('agent_bot_id', req.params.agentBotId)
      .order('created_at', { ascending: false })

    if (error) throw error
    res.json({ rules: data })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/agent-bots/:agentBotId/escalation-rules
router.post('/agent-bots/:agentBotId/escalation-rules', checkRole('admin'), verifyAgentOwner, async (req, res) => {
  try {
    const { title, trigger_description, rules, audience, assign_to_agent, is_active } = req.body
    if (!title) {
      return res.status(400).json({ error: 'Titre requis' })
    }

    const { data, error } = await req.supabase
      .from('escalation_rules')
      .insert({
        user_id: req.user.user_id,
        agent_bot_id: parseInt(req.params.agentBotId),
        title,
        trigger_description: trigger_description || null,
        rules: rules || null,
        audience: audience || null,
        assign_to_agent: assign_to_agent || null,
        is_active: is_active !== undefined ? is_active : true,
      })
      .select()
      .single()

    if (error) throw error
    res.status(201).json({ rule: data })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PUT /api/agent-bots/:agentBotId/escalation-rules/:id
router.put('/agent-bots/:agentBotId/escalation-rules/:id', checkRole('admin'), verifyAgentOwner, async (req, res) => {
  try {
    const { id } = req.params
    const { title, trigger_description, rules, audience, assign_to_agent, is_active } = req.body

    const updates = {}
    if (title !== undefined) updates.title = title
    if (trigger_description !== undefined) updates.trigger_description = trigger_description
    if (rules !== undefined) updates.rules = rules
    if (audience !== undefined) updates.audience = audience
    if (assign_to_agent !== undefined) updates.assign_to_agent = assign_to_agent
    if (is_active !== undefined) updates.is_active = is_active

    const { data, error } = await req.supabase
      .from('escalation_rules')
      .update(updates)
      .eq('id', id)
      .eq('agent_bot_id', req.params.agentBotId)
      .select()
      .single()

    if (error) throw error
    res.json({ rule: data })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/agent-bots/:agentBotId/escalation-rules/:id
router.delete('/agent-bots/:agentBotId/escalation-rules/:id', checkRole('admin'), verifyAgentOwner, async (req, res) => {
  try {
    const { id } = req.params
    const { error } = await req.supabase
      .from('escalation_rules')
      .delete()
      .eq('id', id)
      .eq('agent_bot_id', req.params.agentBotId)

    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
