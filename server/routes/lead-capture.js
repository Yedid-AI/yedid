import { Router } from 'express'
import { normalizeService, resolveCompany, resolveFixedBranch, normalizePhone, listServices } from '../normalize-service.js'
import { resolveBranchId } from '../lead-scope.js'

const router = Router()

// GET /api/public/capture/:token — get form config (user info, org)
router.get('/public/capture/:token', async (req, res) => {
  try {
    const { token } = req.params

    const { data: user, error } = await req.supabaseAdmin
      .from('users')
      .select('id, first_name, last_name, enterprise')
      .eq('capture_token', token)
      .limit(1)
      .maybeSingle()

    if (error) throw error
    if (!user) return res.status(404).json({ error: 'Lien invalide' })

    // Get lead field definitions for this user
    const { data: fields } = await req.supabaseAdmin
      .from('lead_field_definitions')
      .select('field_key, label, field_type, options, required, display_order')
      .eq('user_id', user.id)
      .order('display_order', { ascending: true })

    res.json({
      user_name: [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Agent',
      enterprise: user.enterprise || null,
      fields: fields || [],
      services: listServices().map(s => s.name),
    })
  } catch (err) {
    console.error('[lead-capture]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// POST /api/public/capture/:token — submit a lead (no auth required)
router.post('/public/capture/:token', async (req, res) => {
  try {
    const { token } = req.params

    const { data: user, error: userErr } = await req.supabaseAdmin
      .from('users')
      .select('id, email')
      .eq('capture_token', token)
      .limit(1)
      .maybeSingle()

    if (userErr) throw userErr
    if (!user) return res.status(404).json({ error: 'Lien invalide' })

    const name = req.body.name
    const phone = normalizePhone(req.body.phone)
    if (!name || !phone) return res.status(400).json({ error: 'name et phone requis' })

    const serviceNormalized = normalizeService(req.body.service_requested)
    const company = req.body.company || resolveCompany(serviceNormalized)

    let branch = req.body.branch || resolveFixedBranch(serviceNormalized) || null
    if (!branch && req.body.city && company === 'babait') {
      const { data: idx } = await req.supabaseAdmin
        .from('city_branch_index')
        .select('branch_name')
        .eq('city', req.body.city)
        .limit(1)
      if (idx?.length) branch = idx[0].branch_name
    }

    const branchId = branch ? await resolveBranchId(req.supabaseAdmin, user.id, branch) : null

    // Check for existing lead by phone + user_id
    const { data: existing } = await req.supabaseAdmin
      .from('leads')
      .select('id')
      .eq('user_id', user.id)
      .eq('phone', phone)
      .limit(1)

    let leadId
    if (existing?.length) {
      // Enrich existing lead
      const updates = { updated_at: new Date().toISOString() }
      if (req.body.email) updates.email = req.body.email
      if (req.body.city) updates.city = req.body.city
      if (branch) updates.branch = branch
      if (branchId) updates.branch_id = branchId

      await req.supabaseAdmin.from('leads').update(updates).eq('id', existing[0].id)
      leadId = existing[0].id
    } else {
      // Create new lead
      const insert = {
        user_id: user.id,
        company,
        type: req.body.type || 'patient',
        name, phone,
        email: req.body.email || null,
        city: req.body.city || null,
        branch,
        branch_id: branchId,
        source: req.body.source || 'capture_link',
        lead_channel: 'capture_link',
        service_requested: serviceNormalized,
        service_type: req.body.service_type || null,
        details: req.body.details || null,
        status: 'new',
        custom_fields: req.body.custom_fields || {},
        ip_address: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || null,
      }

      let { data, error } = await req.supabaseAdmin.from('leads').insert(insert).select('id').single()
      // Race: concurrent capture for same (user_id, phone) — recover by reading the winner.
      if (error?.code === '23505') {
        const { data: winner } = await req.supabaseAdmin
          .from('leads')
          .select('id')
          .eq('user_id', user.id)
          .eq('phone', phone)
          .limit(1)
          .maybeSingle()
        if (winner) data = winner
        else throw error
      } else if (error) {
        throw error
      }
      leadId = data.id

      // Log activity
      await req.supabaseAdmin.from('lead_activities').insert({
        lead_id: leadId,
        user_id: user.id,
        action: 'created',
        metadata: { source: 'capture_link', lead_channel: 'capture_link' },
        actor: 'capture_link',
      }).catch(() => {})
    }

    // Auto-affiliate to the capture link owner
    await req.supabaseAdmin.from('lead_affiliations').upsert({
      lead_id: leadId,
      user_id: user.id,
      source: 'capture_link',
    }, { onConflict: 'lead_id,user_id' }).catch(() => {})

    // Auto-dispatch if configured
    if (branch) {
      try {
        const { data: config } = await req.supabaseAdmin
          .from('dispatch_config')
          .select('auto_dispatch')
          .eq('user_id', user.id)
          .limit(1)
          .maybeSingle()

        if (config?.auto_dispatch) {
          const { dispatchLead } = await import('./leads.js')
          const { data: lead } = await req.supabaseAdmin.from('leads').select('*').eq('id', leadId).single()
          if (lead) await dispatchLead(req.supabaseAdmin, lead)
        }
      } catch (e) {
        console.log('[capture/auto-dispatch]', e.message)
      }
    }

    res.status(201).json({ success: true })
  } catch (err) {
    console.error('[lead-capture]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

export default router
