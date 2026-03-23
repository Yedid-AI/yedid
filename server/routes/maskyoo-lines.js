import { Router } from 'express'
import { checkRole } from '../middleware.js'

const router = Router()

// ─── Maskyoo Orgs ────────────────────────────────────────────

// GET /api/maskyoo-orgs
router.get('/maskyoo-orgs', checkRole('admin'), async (req, res) => {
  try {
    const userId = req.user.user_id
    const { data, error } = await req.supabaseAdmin
      .from('maskyoo_orgs')
      .select('*, maskyoo_lines(count)')
      .eq('user_id', userId)
      .order('name')

    if (error) throw error
    res.json({ orgs: data || [] })
  } catch (err) {
    console.error('[maskyoo-orgs] GET', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// POST /api/maskyoo-orgs
router.post('/maskyoo-orgs', checkRole('admin'), async (req, res) => {
  try {
    const userId = req.user.user_id
    const { name } = req.body
    if (!name?.trim()) return res.status(400).json({ error: 'Nom requis' })

    const { data, error } = await req.supabaseAdmin
      .from('maskyoo_orgs')
      .insert({ user_id: userId, name: name.trim() })
      .select()
      .single()

    if (error) throw error
    res.json({ org: data })
  } catch (err) {
    console.error('[maskyoo-orgs] POST', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// PUT /api/maskyoo-orgs/:id
router.put('/maskyoo-orgs/:id', checkRole('admin'), async (req, res) => {
  try {
    const userId = req.user.user_id
    const { name } = req.body
    if (!name?.trim()) return res.status(400).json({ error: 'Nom requis' })

    const { data, error } = await req.supabaseAdmin
      .from('maskyoo_orgs')
      .update({ name: name.trim() })
      .eq('id', parseInt(req.params.id))
      .eq('user_id', userId)
      .select()
      .single()

    if (error) throw error
    res.json({ org: data })
  } catch (err) {
    console.error('[maskyoo-orgs] PUT', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// DELETE /api/maskyoo-orgs/:id
router.delete('/maskyoo-orgs/:id', checkRole('admin'), async (req, res) => {
  try {
    const userId = req.user.user_id
    const { error } = await req.supabaseAdmin
      .from('maskyoo_orgs')
      .delete()
      .eq('id', parseInt(req.params.id))
      .eq('user_id', userId)

    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    console.error('[maskyoo-orgs] DELETE', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// ─── Maskyoo Lines ───────────────────────────────────────────

// GET /api/maskyoo-lines
router.get('/maskyoo-lines', checkRole('admin'), async (req, res) => {
  try {
    const userId = req.user.user_id
    const query = req.supabaseAdmin
      .from('maskyoo_lines')
      .select('*, org:maskyoo_orgs(id, name)')
      .eq('user_id', userId)
      .order('user_name')

    if (req.query.org_id) {
      query.eq('org_id', parseInt(req.query.org_id))
    }

    const { data, error } = await query
    if (error) throw error
    res.json({ lines: data || [] })
  } catch (err) {
    console.error('[maskyoo-lines] GET', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// POST /api/maskyoo-lines — create or assign a line
router.post('/maskyoo-lines', checkRole('admin'), async (req, res) => {
  try {
    const userId = req.user.user_id
    const { user_name, cdr_ddi, label, org_id } = req.body
    if (!user_name || !cdr_ddi) return res.status(400).json({ error: 'user_name et cdr_ddi requis' })

    const { data, error } = await req.supabaseAdmin
      .from('maskyoo_lines')
      .upsert(
        { user_id: userId, user_name, cdr_ddi, label: label || null, org_id: org_id || null },
        { onConflict: 'user_id,user_name,cdr_ddi' }
      )
      .select('*, org:maskyoo_orgs(id, name)')
      .single()

    if (error) throw error
    res.json({ line: data })
  } catch (err) {
    console.error('[maskyoo-lines] POST', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// PUT /api/maskyoo-lines/:id
router.put('/maskyoo-lines/:id', checkRole('admin'), async (req, res) => {
  try {
    const userId = req.user.user_id
    const updates = {}
    if (req.body.label !== undefined) updates.label = req.body.label || null
    if (req.body.org_id !== undefined) updates.org_id = req.body.org_id || null

    const { data, error } = await req.supabaseAdmin
      .from('maskyoo_lines')
      .update(updates)
      .eq('id', parseInt(req.params.id))
      .eq('user_id', userId)
      .select('*, org:maskyoo_orgs(id, name)')
      .single()

    if (error) throw error
    res.json({ line: data })
  } catch (err) {
    console.error('[maskyoo-lines] PUT', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// DELETE /api/maskyoo-lines/:id
router.delete('/maskyoo-lines/:id', checkRole('admin'), async (req, res) => {
  try {
    const userId = req.user.user_id
    const { error } = await req.supabaseAdmin
      .from('maskyoo_lines')
      .delete()
      .eq('id', parseInt(req.params.id))
      .eq('user_id', userId)

    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    console.error('[maskyoo-lines] DELETE', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// POST /api/maskyoo-lines/sync — auto-discover lines from calls table
router.post('/maskyoo-lines/sync', checkRole('admin'), async (req, res) => {
  try {
    const userId = req.user.user_id

    // Get distinct user_name + cdr_ddi from calls
    const { data: calls, error: callsErr } = await req.supabaseAdmin
      .from('calls')
      .select('user_name, cdr_ddi')
      .eq('user_id', userId)

    if (callsErr) throw callsErr

    // Deduplicate
    const seen = new Set()
    const toUpsert = []
    for (const row of (calls || [])) {
      if (!row.user_name && !row.cdr_ddi) continue
      const key = `${row.user_name || ''}|${row.cdr_ddi || ''}`
      if (seen.has(key)) continue
      seen.add(key)
      toUpsert.push({
        user_id: userId,
        user_name: row.user_name || '',
        cdr_ddi: row.cdr_ddi || '',
      })
    }

    if (toUpsert.length > 0) {
      const { error: upsertErr } = await req.supabaseAdmin
        .from('maskyoo_lines')
        .upsert(toUpsert, { onConflict: 'user_id,user_name,cdr_ddi', ignoreDuplicates: true })

      if (upsertErr) throw upsertErr
    }

    // Return all lines
    const { data: lines } = await req.supabaseAdmin
      .from('maskyoo_lines')
      .select('*, org:maskyoo_orgs(id, name)')
      .eq('user_id', userId)
      .order('user_name')

    res.json({ lines: lines || [], synced: toUpsert.length })
  } catch (err) {
    console.error('[maskyoo-lines/sync]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

export default router
