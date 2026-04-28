import { Router } from 'express'
import { getSetting } from '../settings.js'
import { normalizeService, resolveCompany, resolveFixedBranch, normalizePhone } from '../normalize-service.js'
import { resolveCompanyOwnerId, resolveBranchId } from '../lead-scope.js'

const router = Router()

// Map udi → babait (udi is a sub-brand of babait, see normalize-service.js)
function resolveOwnerEnterprise(company) {
  if (company === 'udi') return 'babait'
  return company
}

// POST /api/public/leads — public endpoint for external lead intake
router.post('/public/leads', async (req, res) => {
  try {
    // Validate API key
    const apiKey = req.headers['x-api-key']
    const expectedKey = getSetting('LEAD_API_KEY')
    if (!expectedKey || apiKey !== expectedKey) {
      return res.status(401).json({ error: 'API key invalide' })
    }

    const name = req.body.name
    const phone = normalizePhone(req.body.phone)
    if (!name || !phone) return res.status(400).json({ error: 'name et phone requis' })

    const serviceNormalized = normalizeService(req.body.service_requested)
    const company = req.body.company || resolveCompany(serviceNormalized)

    // Resolve user_id: explicit body > company owner > setting > first admin
    let userId = req.body.user_id || null
    if (!userId) {
      userId = await resolveCompanyOwnerId(req.supabaseAdmin, resolveOwnerEnterprise(company))
    }
    if (!userId) {
      const defaultId = getSetting('LEAD_DEFAULT_USER_ID')
      if (defaultId) userId = parseInt(defaultId)
    }
    if (!userId) {
      const { data: admins } = await req.supabaseAdmin
        .from('users').select('id').in('role', ['admin', 'super_admin'])
        .order('id', { ascending: true }).limit(1)
      if (admins?.length) userId = admins[0].id
    }
    if (!userId) return res.status(400).json({ error: 'Impossible de determiner le user_id' })

    // Auto-resolve branch: fixed branch (Udi services → אודי) or city→branch index
    let branch = req.body.branch || resolveFixedBranch(serviceNormalized) || null
    if (!branch && req.body.city && company === 'babait') {
      const { data: idx } = await req.supabaseAdmin
        .from('city_branch_index')
        .select('branch_name')
        .eq('city', req.body.city)
        .limit(1)
      if (idx?.length) branch = idx[0].branch_name
    }

    const branchId = branch ? await resolveBranchId(req.supabaseAdmin, userId, branch) : null

    // Check for existing lead by normalized phone + user_id
    const { data: existing } = await req.supabaseAdmin
      .from('leads')
      .select('*')
      .eq('user_id', userId)
      .eq('phone', phone)
      .order('created_at', { ascending: false })
      .limit(1)

    if (existing?.length) {
      // Merge into existing lead — enrich empty fields + append history
      const lead = existing[0]
      const updates = { updated_at: new Date().toISOString() }
      if (name && !lead.name) updates.name = name
      if (req.body.email && !lead.email) updates.email = req.body.email
      if (req.body.city && !lead.city) updates.city = req.body.city
      if (branch && !lead.branch) updates.branch = branch
      if (branchId && !lead.branch_id) updates.branch_id = branchId
      if (serviceNormalized && !lead.service_requested) updates.service_requested = serviceNormalized
      if (req.body.service_type && !lead.service_type) updates.service_type = req.body.service_type
      if (company && !lead.company) updates.company = company

      // Append to history
      const history = lead.metadata?.history || []
      history.push({
        date: new Date().toISOString(),
        name,
        source: req.body.source || null,
        lead_channel: req.body.lead_channel || null,
        service_requested: serviceNormalized,
        details: req.body.details || null,
        campaign: req.body.campaign || null,
      })
      updates.metadata = { ...(lead.metadata || {}), history }

      const { data, error } = await req.supabaseAdmin
        .from('leads')
        .update(updates)
        .eq('id', lead.id)
        .select()
        .single()

      if (error) throw error
      return res.status(200).json({ success: true, lead_id: data.id, merged: true })
    }

    // Create new lead
    const insert = {
      user_id: userId,
      company,
      type: req.body.type || 'patient',
      name,
      phone,
      email: req.body.email || null,
      city: req.body.city || null,
      branch,
      branch_id: branchId,
      coordinator: req.body.coordinator || null,
      source: req.body.source || null,
      lead_channel: req.body.lead_channel || null,
      service_requested: serviceNormalized,
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

    let { data, error } = await req.supabaseAdmin
      .from('leads')
      .insert(insert)
      .select()
      .single()

    // Race against the unique (user_id, phone) index — concurrent submission landed first.
    if (error?.code === '23505') {
      const { data: winner } = await req.supabaseAdmin
        .from('leads')
        .select('*')
        .eq('user_id', userId)
        .eq('phone', phone)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (winner) {
        return res.status(200).json({ success: true, lead_id: winner.id, merged: true, raced: true })
      }
    }
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
