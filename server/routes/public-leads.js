import { Router } from 'express'
import { getSetting } from '../settings.js'
import { normalizeService } from '../normalize-service.js'

const router = Router()

// POST /api/public/leads — public endpoint for external lead intake
router.post('/public/leads', async (req, res) => {
  try {
    // Validate API key
    const apiKey = req.headers['x-api-key']
    const expectedKey = getSetting('LEAD_API_KEY')
    if (!expectedKey || apiKey !== expectedKey) {
      return res.status(401).json({ error: 'API key invalide' })
    }

    const { name, phone } = req.body
    if (!name || !phone) return res.status(400).json({ error: 'name et phone requis' })

    // Resolve user_id: from body, setting, or first admin
    let userId = req.body.user_id || null
    if (!userId) {
      const defaultId = getSetting('LEAD_DEFAULT_USER_ID')
      if (defaultId) {
        userId = parseInt(defaultId)
      } else {
        // Fallback: first admin user
        const { data: admins } = await req.supabaseAdmin
          .from('users')
          .select('id')
          .in('role', ['admin', 'super_admin'])
          .order('id', { ascending: true })
          .limit(1)
        if (admins?.length) userId = admins[0].id
      }
    }
    if (!userId) return res.status(400).json({ error: 'Impossible de determiner le user_id' })

    // Auto-resolve city → branch
    let branch = req.body.branch || null
    if (!branch && req.body.city) {
      const { data: idx } = await req.supabaseAdmin
        .from('city_branch_index')
        .select('branch_name')
        .eq('user_id', userId)
        .eq('city', req.body.city)
        .limit(1)
      if (idx?.length) branch = idx[0].branch_name
    }

    const insert = {
      user_id: userId,
      company: req.body.company || 'babait',
      type: req.body.type || 'patient',
      name,
      phone,
      email: req.body.email || null,
      city: req.body.city || null,
      branch,
      coordinator: req.body.coordinator || null,
      source: req.body.source || null,
      lead_channel: req.body.lead_channel || null,
      service_requested: normalizeService(req.body.service_requested),
      service_type: req.body.service_type || null,
      details: req.body.details || null,
      status: 'new',
      position_type: req.body.position_type || null,
      experience: req.body.experience ?? null,
      ip_address: req.body.ip_address || req.ip || null,
      campaign: req.body.campaign || null,
      custom_fields: req.body.custom_fields || {},
      metadata: req.body.metadata || null,
    }

    const { data, error } = await req.supabaseAdmin
      .from('leads')
      .insert(insert)
      .select()
      .single()

    if (error) throw error

    // Auto-dispatch if configured
    if (data.branch) {
      try {
        const { data: config } = await req.supabaseAdmin
          .from('dispatch_config')
          .select('auto_dispatch')
          .eq('user_id', userId)
          .limit(1)
          .maybeSingle()

        if (config?.auto_dispatch) {
          // Import dispatchLead dynamically to avoid circular deps
          const { dispatchLead } = await import('./leads.js')
          await dispatchLead(req.supabaseAdmin, data)
        }
      } catch (dispatchErr) {
        console.log('[public-leads/auto-dispatch]', dispatchErr.message)
      }
    }

    res.status(201).json({ success: true, lead_id: data.id })
  } catch (err) {
    console.error('[public-leads]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

export default router
