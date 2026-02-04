import { Router } from 'express'
import { checkRole } from '../middleware.js'

const router = Router()

// GET /api/escalation-rules — list all escalation rules for current user
router.get('/escalation-rules', checkRole('admin'), async (req, res) => {
  try {
    const { data, error } = await req.supabase
      .from('escalation_rules')
      .select('*')
      .eq('user_id', req.user.user_id)
      .order('created_at', { ascending: false })

    if (error) throw error
    res.json({ rules: data })
  } catch (err) {
    console.error('[escalation-library]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// POST /api/escalation-rules — create escalation rule
router.post('/escalation-rules', checkRole('admin'), async (req, res) => {
  try {
    const { title, trigger_description, rules, audience, assign_to_agent, is_active, emoji } = req.body
    if (!title) {
      return res.status(400).json({ error: 'Titre requis' })
    }

    const { data, error } = await req.supabase
      .from('escalation_rules')
      .insert({
        user_id: req.user.user_id,
        title,
        trigger_description: trigger_description || null,
        rules: rules || null,
        audience: audience || null,
        assign_to_agent: assign_to_agent || null,
        is_active: is_active !== undefined ? is_active : true,
        emoji: emoji || null,
      })
      .select()
      .single()

    if (error) throw error
    res.status(201).json({ rule: data })
  } catch (err) {
    console.error('[escalation-library]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// PUT /api/escalation-rules/:id — update escalation rule
router.put('/escalation-rules/:id', checkRole('admin'), async (req, res) => {
  try {
    const { id } = req.params
    const { title, trigger_description, rules, audience, assign_to_agent, is_active, emoji } = req.body

    const updates = {}
    if (title !== undefined) updates.title = title
    if (trigger_description !== undefined) updates.trigger_description = trigger_description
    if (rules !== undefined) updates.rules = rules
    if (audience !== undefined) updates.audience = audience
    if (assign_to_agent !== undefined) updates.assign_to_agent = assign_to_agent
    if (is_active !== undefined) updates.is_active = is_active
    if (emoji !== undefined) updates.emoji = emoji || null

    const { data, error } = await req.supabase
      .from('escalation_rules')
      .update(updates)
      .eq('id', id)
      .eq('user_id', req.user.user_id)
      .select()
      .single()

    if (error) throw error
    if (!data) return res.status(404).json({ error: 'Regle introuvable' })
    res.json({ rule: data })
  } catch (err) {
    console.error('[escalation-library]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// DELETE /api/escalation-rules/:id — delete escalation rule
router.delete('/escalation-rules/:id', checkRole('admin'), async (req, res) => {
  try {
    const { id } = req.params
    const { error } = await req.supabase
      .from('escalation_rules')
      .delete()
      .eq('id', id)
      .eq('user_id', req.user.user_id)

    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    console.error('[escalation-library]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

export default router
