import { Router } from 'express'
import { checkRole } from '../middleware.js'

const router = Router()

// GET /api/playbooks — list all playbooks for current user
router.get('/playbooks', checkRole('admin'), async (req, res) => {
  try {
    const { data, error } = await req.supabase
      .from('playbooks')
      .select('*, tools(id, name)')
      .eq('user_id', req.user.user_id)
      .order('created_at', { ascending: false })

    if (error) throw error
    res.json({ playbooks: data })
  } catch (err) {
    console.error('[playbooks-library]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// POST /api/playbooks — create playbook
router.post('/playbooks', checkRole('admin'), async (req, res) => {
  try {
    const { title, content, audience, rules, tool_id, is_active } = req.body
    if (!title || !content) {
      return res.status(400).json({ error: 'Titre et contenu requis' })
    }

    const { data, error } = await req.supabase
      .from('playbooks')
      .insert({
        user_id: req.user.user_id,
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
    console.error('[playbooks-library]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// PUT /api/playbooks/:id — update playbook
router.put('/playbooks/:id', checkRole('admin'), async (req, res) => {
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
      .eq('user_id', req.user.user_id)
      .select('*, tools(id, name)')
      .single()

    if (error) throw error
    if (!data) return res.status(404).json({ error: 'Playbook introuvable' })
    res.json({ playbook: data })
  } catch (err) {
    console.error('[playbooks-library]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// DELETE /api/playbooks/:id — delete playbook
router.delete('/playbooks/:id', checkRole('admin'), async (req, res) => {
  try {
    const { id } = req.params
    const { error } = await req.supabase
      .from('playbooks')
      .delete()
      .eq('id', id)
      .eq('user_id', req.user.user_id)

    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    console.error('[playbooks-library]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

export default router
