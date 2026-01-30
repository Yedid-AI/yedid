import { Router } from 'express'
import { checkRole, verifyAgentOwner } from '../middleware.js'

const router = Router()

// GET /api/agent-bots/:agentBotId/tools
router.get('/agent-bots/:agentBotId/tools', checkRole('admin'), verifyAgentOwner, async (req, res) => {
  try {
    const { data, error } = await req.supabase
      .from('tools')
      .select('*')
      .eq('agent_bot_id', req.params.agentBotId)
      .order('created_at', { ascending: false })

    if (error) throw error
    res.json({ tools: data })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/agent-bots/:agentBotId/tools
router.post('/agent-bots/:agentBotId/tools', checkRole('admin'), verifyAgentOwner, async (req, res) => {
  try {
    const { name, description, method, url, query_parameters, headers, body_schema } = req.body
    if (!name || !description || !url) {
      return res.status(400).json({ error: 'Nom, description et URL requis' })
    }

    const { data, error } = await req.supabase
      .from('tools')
      .insert({
        user_id: req.user.user_id,
        agent_bot_id: parseInt(req.params.agentBotId),
        name,
        description,
        method: method || 'GET',
        url,
        query_parameters: query_parameters || {},
        headers: headers || {},
        body_schema: body_schema || null,
      })
      .select()
      .single()

    if (error) throw error
    res.status(201).json({ tool: data })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PUT /api/agent-bots/:agentBotId/tools/:id
router.put('/agent-bots/:agentBotId/tools/:id', checkRole('admin'), verifyAgentOwner, async (req, res) => {
  try {
    const { id } = req.params
    const { name, description, method, url, query_parameters, headers, body_schema } = req.body

    const updates = { updated_at: new Date().toISOString() }
    if (name !== undefined) updates.name = name
    if (description !== undefined) updates.description = description
    if (method !== undefined) updates.method = method
    if (url !== undefined) updates.url = url
    if (query_parameters !== undefined) updates.query_parameters = query_parameters
    if (headers !== undefined) updates.headers = headers
    if (body_schema !== undefined) updates.body_schema = body_schema

    const { data, error } = await req.supabase
      .from('tools')
      .update(updates)
      .eq('id', id)
      .eq('agent_bot_id', req.params.agentBotId)
      .select()
      .single()

    if (error) throw error
    res.json({ tool: data })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/agent-bots/:agentBotId/tools/:id
router.delete('/agent-bots/:agentBotId/tools/:id', checkRole('admin'), verifyAgentOwner, async (req, res) => {
  try {
    const { id } = req.params
    const { error } = await req.supabase
      .from('tools')
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
