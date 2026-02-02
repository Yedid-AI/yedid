import { Router } from 'express'
import { checkRole, verifyAgentOwner } from '../middleware.js'

const router = Router()

// GET /api/agent-bots/:agentBotId/playbooks
router.get('/agent-bots/:agentBotId/playbooks', checkRole('admin'), verifyAgentOwner, async (req, res) => {
  try {
    const { data, error } = await req.supabase
      .from('playbooks')
      .select('*, tools(id, name)')
      .eq('agent_bot_id', req.params.agentBotId)
      .order('created_at', { ascending: false })

    if (error) throw error
    res.json({ playbooks: data })
  } catch (err) {
    console.error('[playbooks]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// POST /api/agent-bots/:agentBotId/playbooks
router.post('/agent-bots/:agentBotId/playbooks', checkRole('admin'), verifyAgentOwner, async (req, res) => {
  try {
    const { title, content, audience, rules, tool_id, is_active } = req.body
    if (!title || !content) {
      return res.status(400).json({ error: 'Titre et contenu requis' })
    }

    const { data, error } = await req.supabase
      .from('playbooks')
      .insert({
        user_id: req.user.user_id,
        agent_bot_id: parseInt(req.params.agentBotId),
        title,
        content,
        audience: audience || null,
        rules: rules || null,
        tool_id: tool_id || null,
        is_active: is_active !== undefined ? is_active : true,
      })
      .select('*, tools(id, name)')
      .single()

    if (error) throw error
    res.status(201).json({ playbook: data })
  } catch (err) {
    console.error('[playbooks]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// PUT /api/agent-bots/:agentBotId/playbooks/:id
router.put('/agent-bots/:agentBotId/playbooks/:id', checkRole('admin'), verifyAgentOwner, async (req, res) => {
  try {
    const { id } = req.params
    const { title, content, audience, rules, tool_id, is_active } = req.body

    const updates = { updated_at: new Date().toISOString() }
    if (title !== undefined) updates.title = title
    if (content !== undefined) updates.content = content
    if (audience !== undefined) updates.audience = audience
    if (rules !== undefined) updates.rules = rules
    if (tool_id !== undefined) updates.tool_id = tool_id
    if (is_active !== undefined) updates.is_active = is_active

    const { data, error } = await req.supabase
      .from('playbooks')
      .update(updates)
      .eq('id', id)
      .eq('agent_bot_id', req.params.agentBotId)
      .select('*, tools(id, name)')
      .single()

    if (error) throw error
    res.json({ playbook: data })
  } catch (err) {
    console.error('[playbooks]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// DELETE /api/agent-bots/:agentBotId/playbooks/:id
router.delete('/agent-bots/:agentBotId/playbooks/:id', checkRole('admin'), verifyAgentOwner, async (req, res) => {
  try {
    const { id } = req.params
    const { error } = await req.supabase
      .from('playbooks')
      .delete()
      .eq('id', id)
      .eq('agent_bot_id', req.params.agentBotId)

    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    console.error('[playbooks]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

export default router
