import { Router } from 'express'
import { checkRole } from '../middleware.js'

const router = Router()

// GET /api/tools — list all tools for current user
router.get('/tools', checkRole('admin'), async (req, res) => {
  try {
    const { data, error } = await req.supabase
      .from('tools')
      .select('*')
      .eq('user_id', req.user.user_id)
      .order('created_at', { ascending: false })

    if (error) throw error
    res.json({ tools: data })
  } catch (err) {
    console.error('[tools-library]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// POST /api/tools — create tool
router.post('/tools', checkRole('admin'), async (req, res) => {
  try {
    const { name, description, method, url, query_parameters, headers, body_schema, emoji } = req.body
    if (!name || !description || !url) {
      return res.status(400).json({ error: 'Nom, description et URL requis' })
    }

    const { data, error } = await req.supabase
      .from('tools')
      .insert({
        user_id: req.user.user_id,
        name,
        description,
        method: method || 'GET',
        url,
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
    const { name, description, method, url, query_parameters, headers, body_schema, emoji } = req.body

    const updates = { updated_at: new Date().toISOString() }
    if (name !== undefined) updates.name = name
    if (description !== undefined) updates.description = description
    if (method !== undefined) updates.method = method
    if (url !== undefined) updates.url = url
    if (query_parameters !== undefined) updates.query_parameters = query_parameters
    if (headers !== undefined) updates.headers = headers
    if (body_schema !== undefined) updates.body_schema = body_schema
    if (emoji !== undefined) updates.emoji = emoji || null

    const { data, error } = await req.supabase
      .from('tools')
      .update(updates)
      .eq('id', id)
      .eq('user_id', req.user.user_id)
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
    const { error } = await req.supabase
      .from('tools')
      .delete()
      .eq('id', id)
      .eq('user_id', req.user.user_id)

    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    console.error('[tools-library]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

export default router
