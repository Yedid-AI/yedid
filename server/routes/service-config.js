import { Router } from 'express'
import { checkRole } from '../middleware.js'
import { loadServiceCache } from '../normalize-service.js'

const router = Router()

const ALLOWED_COMPANIES = ['babait', 'aviezer']

function sanitizeAliases(input) {
  if (!Array.isArray(input)) return []
  const out = []
  for (const a of input) {
    const s = typeof a === 'string' ? a.trim() : ''
    if (s) out.push(s)
  }
  return Array.from(new Set(out))
}

function pickPayload(body) {
  const payload = {}
  if (typeof body.name === 'string') payload.name = body.name.trim()
  if (Array.isArray(body.aliases)) payload.aliases = sanitizeAliases(body.aliases)
  if ('company' in body) {
    const c = body.company === '' || body.company == null ? null : String(body.company).trim().toLowerCase()
    if (c !== null && !ALLOWED_COMPANIES.includes(c)) {
      throw new Error(`company must be one of: ${ALLOWED_COMPANIES.join(', ')}`)
    }
    payload.company = c
  }
  if ('fixed_branch' in body) {
    const fb = body.fixed_branch === '' || body.fixed_branch == null ? null : String(body.fixed_branch).trim()
    payload.fixed_branch = fb
  }
  if ('display_order' in body) payload.display_order = Number(body.display_order) || 0
  if ('is_active' in body) payload.is_active = !!body.is_active
  return payload
}

// GET /api/service-config — list services (any authenticated user can read)
router.get('/service-config', async (req, res) => {
  try {
    const supabase = req.supabaseAdmin || req.supabase
    const { data, error } = await supabase
      .from('service_config')
      .select('*')
      .order('display_order', { ascending: true })
    if (error) throw error
    res.json({ services: data || [] })
  } catch (err) {
    console.error('[service-config] GET', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// POST /api/service-config — create
router.post('/service-config', checkRole('super_admin', 'admin'), async (req, res) => {
  try {
    const payload = pickPayload(req.body || {})
    if (!payload.name) return res.status(400).json({ error: 'name est requis' })

    const supabase = req.supabaseAdmin || req.supabase
    const { data, error } = await supabase
      .from('service_config')
      .insert({ ...payload, updated_at: new Date().toISOString() })
      .select('*')
      .single()
    if (error) throw error

    await loadServiceCache(req.supabaseAdmin)
    res.json({ service: data })
  } catch (err) {
    console.error('[service-config] POST', err.message)
    res.status(400).json({ error: err.message || 'Erreur interne' })
  }
})

// PUT /api/service-config/:id — update
router.put('/service-config/:id', checkRole('super_admin', 'admin'), async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!id) return res.status(400).json({ error: 'id invalide' })
    const payload = pickPayload(req.body || {})

    const supabase = req.supabaseAdmin || req.supabase
    const { data, error } = await supabase
      .from('service_config')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single()
    if (error) throw error

    await loadServiceCache(req.supabaseAdmin)
    res.json({ service: data })
  } catch (err) {
    console.error('[service-config] PUT', err.message)
    res.status(400).json({ error: err.message || 'Erreur interne' })
  }
})

// DELETE /api/service-config/:id
router.delete('/service-config/:id', checkRole('super_admin', 'admin'), async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!id) return res.status(400).json({ error: 'id invalide' })

    const supabase = req.supabaseAdmin || req.supabase
    const { error } = await supabase.from('service_config').delete().eq('id', id)
    if (error) throw error

    await loadServiceCache(req.supabaseAdmin)
    res.json({ ok: true })
  } catch (err) {
    console.error('[service-config] DELETE', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

export default router
