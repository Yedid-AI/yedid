import { Router } from 'express'
import { checkRole } from '../middleware.js'

const router = Router()

/**
 * Helper: get all agent_bot IDs owned by current user.
 */
async function getUserBotIds(supabase, userId) {
  const { data } = await supabase
    .from('agent_bots')
    .select('id')
    .eq('user_id', userId)
  return (data || []).map(b => b.id)
}

// GET /api/tools — list all tools for current user (via agent_bots ownership)
router.get('/tools', checkRole('admin'), async (req, res) => {
  try {
    const botIds = await getUserBotIds(req.supabaseAdmin, req.user.user_id)
    if (botIds.length === 0) return res.json({ tools: [] })

    const { data, error } = await req.supabaseAdmin
      .from('tools')
      .select('*')
      .in('agent_bot_id', botIds)
      .order('created_at', { ascending: false })

    if (error) throw error
    res.json({ tools: data })
  } catch (err) {
    console.error('[tools-library]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// POST /api/tools — create tool (api or internal)
router.post('/tools', checkRole('admin'), async (req, res) => {
  try {
    const { name, description, method, url, query_parameters, headers, body_schema, emoji, type, handler } = req.body
    const toolType = type || 'api'

    if (!name || !description) {
      return res.status(400).json({ error: 'Nom et description requis' })
    }
    if (toolType === 'api' && !url) {
      return res.status(400).json({ error: 'URL requise pour les tools API' })
    }
    if (toolType === 'internal' && !handler) {
      return res.status(400).json({ error: 'Handler requis pour les tools internes' })
    }

    // Auto-assign to user's first agent_bot
    const botIds = await getUserBotIds(req.supabaseAdmin, req.user.user_id)
    const agentBotId = req.body.agent_bot_id || botIds[0] || null

    const { data, error } = await req.supabaseAdmin
      .from('tools')
      .insert({
        agent_bot_id: agentBotId,
        name,
        description,
        type: toolType,
        handler: toolType === 'internal' ? handler : null,
        method: method || (toolType === 'api' ? 'GET' : null),
        url: url || null,
        query_parameters: query_parameters || {},
        headers: headers || {},
        body_schema: body_schema || null,
        emoji: emoji || null,
      })
      .select()
      .single()

    if (error) throw error
    res.status(201).json({ tool: data })
  } catch (err) {
    console.error('[tools-library]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// PUT /api/tools/:id — update tool
router.put('/tools/:id', checkRole('admin'), async (req, res) => {
  try {
    const { id } = req.params
    const { name, description, method, url, query_parameters, headers, body_schema, emoji, type, handler } = req.body

    const botIds = await getUserBotIds(req.supabaseAdmin, req.user.user_id)
    if (botIds.length === 0) return res.status(404).json({ error: 'Tool introuvable' })

    const updates = { updated_at: new Date().toISOString() }
    if (name !== undefined) updates.name = name
    if (description !== undefined) updates.description = description
    if (method !== undefined) updates.method = method
    if (url !== undefined) updates.url = url
    if (query_parameters !== undefined) updates.query_parameters = query_parameters
    if (headers !== undefined) updates.headers = headers
    if (body_schema !== undefined) updates.body_schema = body_schema
    if (emoji !== undefined) updates.emoji = emoji || null
    if (type !== undefined) updates.type = type
    if (handler !== undefined) updates.handler = handler || null

    const { data, error } = await req.supabaseAdmin
      .from('tools')
      .update(updates)
      .eq('id', id)
      .in('agent_bot_id', botIds)
      .select()
      .single()

    if (error) throw error
    if (!data) return res.status(404).json({ error: 'Tool introuvable' })
    res.json({ tool: data })
  } catch (err) {
    console.error('[tools-library]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// DELETE /api/tools/:id — delete tool
router.delete('/tools/:id', checkRole('admin'), async (req, res) => {
  try {
    const { id } = req.params
    const botIds = await getUserBotIds(req.supabaseAdmin, req.user.user_id)
    if (botIds.length === 0) return res.status(404).json({ error: 'Tool introuvable' })

    const { error } = await req.supabaseAdmin
      .from('tools')
      .delete()
      .eq('id', id)
      .in('agent_bot_id', botIds)

    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    console.error('[tools-library]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

export default router
