import { Router } from 'express'
import { checkRole } from '../middleware.js'

const router = Router()

// GET /api/branches
router.get('/branches', checkRole('admin'), async (req, res) => {
  try {
    let query = req.supabase.from('branches').select('*')
    if (req.user.role !== 'super_admin') {
      query = query.eq('user_id', req.user.user_id)
    }
    const { data, error } = await query.order('name', { ascending: true })

    if (error) throw error
    res.json({ branches: data || [] })
  } catch (err) {
    console.error('[branches]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// POST /api/branches
router.post('/branches', checkRole('admin'), async (req, res) => {
  try {
    const { name, contact_name, email, phone, mobile, fax, address, chatwoot_conversation_id, whatsapp_phone } = req.body
    if (!name) return res.status(400).json({ error: 'Nom requis' })

    const { data, error } = await req.supabase
      .from('branches')
      .insert({
        user_id: req.user.user_id,
        name, contact_name, email, phone, mobile, fax, address,
        chatwoot_conversation_id: chatwoot_conversation_id || null,
        whatsapp_phone: whatsapp_phone || null,
      })
      .select()
      .single()

    if (error) throw error
    res.status(201).json({ branch: data })
  } catch (err) {
    console.error('[branches]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// PUT /api/branches/:id
router.put('/branches/:id', checkRole('admin'), async (req, res) => {
  try {
    const { id } = req.params
    const allowed = ['name', 'contact_name', 'email', 'phone', 'mobile', 'fax', 'address', 'chatwoot_conversation_id', 'whatsapp_phone', 'is_active']
    const updates = { updated_at: new Date().toISOString() }
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key]
    }

    let query = req.supabase.from('branches').update(updates).eq('id', id)
    if (req.user.role !== 'super_admin') {
      query = query.eq('user_id', req.user.user_id)
    }
    const { data, error } = await query.select().single()

    if (error) throw error
    if (!data) return res.status(404).json({ error: 'Branche introuvable' })
    res.json({ branch: data })
  } catch (err) {
    console.error('[branches]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// DELETE /api/branches/:id
router.delete('/branches/:id', checkRole('admin'), async (req, res) => {
  try {
    const { id } = req.params
    let query = req.supabase.from('branches').delete().eq('id', id)
    if (req.user.role !== 'super_admin') {
      query = query.eq('user_id', req.user.user_id)
    }
    const { error } = await query

    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    console.error('[branches]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// ─── City-Branch Index ────────────────────────────────────

// GET /api/city-index
router.get('/city-index', checkRole('admin'), async (req, res) => {
  try {
    let query = req.supabase.from('city_branch_index').select('*')
    if (req.user.role !== 'super_admin') {
      query = query.eq('user_id', req.user.user_id)
    }
    const { data, error } = await query.order('city', { ascending: true })

    if (error) throw error
    res.json({ cities: data || [] })
  } catch (err) {
    console.error('[city-index]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// POST /api/city-index
router.post('/city-index', checkRole('admin'), async (req, res) => {
  try {
    const { city, branch_name } = req.body
    if (!city || !branch_name) return res.status(400).json({ error: 'city et branch_name requis' })

    const { data, error } = await req.supabase
      .from('city_branch_index')
      .insert({ user_id: req.user.user_id, city, branch_name })
      .select()
      .single()

    if (error) throw error
    res.status(201).json({ city: data })
  } catch (err) {
    console.error('[city-index]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// POST /api/city-index/bulk
router.post('/city-index/bulk', checkRole('admin'), async (req, res) => {
  try {
    const { entries } = req.body
    if (!Array.isArray(entries)) return res.status(400).json({ error: 'entries requis (tableau)' })

    // Delete existing and replace
    await req.supabase
      .from('city_branch_index')
      .delete()
      .eq('user_id', req.user.user_id)

    if (entries.length > 0) {
      const rows = entries.map((e) => ({ user_id: req.user.user_id, city: e.city, branch_name: e.branch_name }))
      const { error } = await req.supabase
        .from('city_branch_index')
        .insert(rows)

      if (error) throw error
    }

    res.json({ success: true, count: entries.length })
  } catch (err) {
    console.error('[city-index/bulk]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// DELETE /api/city-index/:id
router.delete('/city-index/:id', checkRole('admin'), async (req, res) => {
  try {
    const { id } = req.params
    const { error } = await req.supabase
      .from('city_branch_index')
      .delete()
      .eq('id', id)
      .eq('user_id', req.user.user_id)

    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    console.error('[city-index]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

export default router
