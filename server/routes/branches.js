import { Router } from 'express'
import { checkRole } from '../middleware.js'
import { resolveCompanyOwnerId } from '../lead-scope.js'

const router = Router()

// Resolve which user_id owns the branches the caller can manage.
// Returns null when caller has no enterprise (= yedid global) and didn't specify one.
async function resolveBranchOwnerId(req, enterpriseOverride) {
  const enterprise = req.user.enterprise || enterpriseOverride || null
  if (!enterprise) return null
  return await resolveCompanyOwnerId(req.supabaseAdmin, enterprise)
}

// GET /api/branches
router.get('/branches', checkRole('admin', 'marketeur', 'branch'), async (req, res) => {
  try {
    const sb = req.supabaseAdmin || req.supabase
    let query = sb.from('branches').select('*').order('name', { ascending: true })

    if (req.user.role === 'branch') {
      const { data: ub } = await sb.from('user_branches').select('branch_id').eq('user_id', req.user.user_id)
      const ids = (ub || []).map(r => r.branch_id)
      if (ids.length === 0) return res.json({ branches: [] })
      query = query.in('id', ids)
    } else if (req.user.role === 'admin' && req.user.enterprise) {
      const ownerId = await resolveCompanyOwnerId(req.supabaseAdmin, req.user.enterprise)
      if (!ownerId) return res.json({ branches: [] })
      query = query.eq('user_id', ownerId)
    }
    // super_admin, admin without enterprise, marketeur → all branches

    const { data, error } = await query
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
    const { name, contact_name, email, phone, mobile, fax, address, chatwoot_conversation_id, whatsapp_phone, enterprise } = req.body
    if (!name) return res.status(400).json({ error: 'Nom requis' })

    // Determine owner: caller's enterprise, or override from body (yedid only)
    const ownerId = req.user.enterprise
      ? await resolveCompanyOwnerId(req.supabaseAdmin, req.user.enterprise)
      : (enterprise ? await resolveCompanyOwnerId(req.supabaseAdmin, enterprise) : req.user.user_id)
    if (!ownerId) return res.status(400).json({ error: 'Societe (enterprise) requise' })

    const { data, error } = await req.supabaseAdmin
      .from('branches')
      .insert({
        user_id: ownerId,
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

// Verify caller can manage branch (must own it via enterprise, or be yedid)
async function canManageBranch(req, branchId) {
  if (req.user.role === 'super_admin') return true
  if (req.user.role === 'admin' && !req.user.enterprise) return true
  const { data: branch } = await req.supabaseAdmin.from('branches').select('user_id').eq('id', branchId).maybeSingle()
  if (!branch) return false
  if (req.user.role === 'admin' && req.user.enterprise) {
    const ownerId = await resolveCompanyOwnerId(req.supabaseAdmin, req.user.enterprise)
    return branch.user_id === ownerId
  }
  return false
}

// PUT /api/branches/:id
router.put('/branches/:id', checkRole('admin'), async (req, res) => {
  try {
    const { id } = req.params
    if (!await canManageBranch(req, id)) return res.status(404).json({ error: 'Branche introuvable' })

    const allowed = ['name', 'contact_name', 'email', 'phone', 'mobile', 'fax', 'address', 'chatwoot_conversation_id', 'whatsapp_phone', 'is_active', 'dispatch_enabled']
    const updates = { updated_at: new Date().toISOString() }
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key]
    }

    const { data, error } = await req.supabaseAdmin.from('branches').update(updates).eq('id', id).select().single()
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
    if (!await canManageBranch(req, id)) return res.status(404).json({ error: 'Branche introuvable' })

    const { error } = await req.supabaseAdmin.from('branches').delete().eq('id', id)
    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    console.error('[branches]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// ─── City-Branch Index ────────────────────────────────────

// Resolve which user_id owns the city_branch_index rows the caller can manage.
function cityIndexOwnerId(req) {
  // Admin company → use the company owner_id (lookup); admin yedid + super_admin → their own id
  if (req.user.enterprise) return null // resolved per request
  return req.user.user_id
}

// GET /api/city-index
router.get('/city-index', checkRole('admin', 'marketeur', 'branch'), async (req, res) => {
  try {
    const sb = req.supabaseAdmin || req.supabase
    let query = sb.from('city_branch_index').select('*').order('city', { ascending: true })

    if (req.user.role === 'admin' && req.user.enterprise) {
      const ownerId = await resolveCompanyOwnerId(req.supabaseAdmin, req.user.enterprise)
      query = ownerId ? query.eq('user_id', ownerId) : query.eq('id', -1)
    }
    // Other roles see all (legacy behavior)

    const { data, error } = await query
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

    const ownerId = req.user.enterprise
      ? await resolveCompanyOwnerId(req.supabaseAdmin, req.user.enterprise)
      : req.user.user_id
    if (!ownerId) return res.status(400).json({ error: 'Societe (enterprise) requise' })

    const { data, error } = await req.supabaseAdmin
      .from('city_branch_index')
      .insert({ user_id: ownerId, city, branch_name })
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

    const ownerId = req.user.enterprise
      ? await resolveCompanyOwnerId(req.supabaseAdmin, req.user.enterprise)
      : req.user.user_id
    if (!ownerId) return res.status(400).json({ error: 'Societe (enterprise) requise' })

    await req.supabaseAdmin.from('city_branch_index').delete().eq('user_id', ownerId)

    if (entries.length > 0) {
      const rows = entries.map((e) => ({ user_id: ownerId, city: e.city, branch_name: e.branch_name }))
      const { error } = await req.supabaseAdmin.from('city_branch_index').insert(rows)
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
    const ownerId = req.user.enterprise
      ? await resolveCompanyOwnerId(req.supabaseAdmin, req.user.enterprise)
      : null

    let query = req.supabaseAdmin.from('city_branch_index').delete().eq('id', id)
    if (ownerId) query = query.eq('user_id', ownerId)
    const { error } = await query

    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    console.error('[city-index]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

export default router
