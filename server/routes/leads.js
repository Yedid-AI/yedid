import { Router } from 'express'
import { checkRole } from '../middleware.js'
import { sendMessage } from '../unipile.js'
import { normalizeService, resolveCompany, resolveFixedBranch, normalizePhone } from '../normalize-service.js'
import { getLeadScope, applyLeadScope, canAccessLead, resolveCompanyOwnerId, resolveBranchId } from '../lead-scope.js'
import { sendNativeMessage } from '../engine/native-messaging.js'
import multer from 'multer'

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })

const router = Router()

// Kill-switch (cf. routes/whatsapp.js)
function isNativeChatEnabledFor(unipileAccountId) {
  const enabled = String(process.env.NATIVE_CHAT_ENABLED || '').toLowerCase() === 'true'
  if (!enabled) return false
  const whitelist = (process.env.NATIVE_CHAT_INBOXES || '').split(',').map(s => s.trim()).filter(Boolean)
  if (whitelist.length === 0) return true
  return whitelist.includes(unipileAccountId)
}

// ─── Leads CRUD ──────────────────────────────────────────

// GET /api/leads — list with filters + stats (server-side filtering & pagination)
router.get('/leads', checkRole('admin', 'marketeur', 'branch'), async (req, res) => {
  try {
    const supabase = req.supabaseAdmin || req.supabase
    const page = Math.max(0, parseInt(req.query.page) || 0)
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.page_size) || 50))
    const emptyResult = { leads: [], stats: { total: 0 }, total: 0, page, page_size: pageSize }

    const scope = await getLeadScope(req)
    if (scope.scope === 'none') return res.json(emptyResult)
    if ((scope.scope === 'branches' || scope.scope === 'affiliations') && scope.value.length === 0) {
      return res.json(emptyResult)
    }

    // Optional admin filter: leads affiliated to a specific user
    let affiliatedFilterIds = null
    const canFilterByAffiliation = scope.scope === 'all' || scope.scope === 'company'
    if (req.query.affiliated_user_id && canFilterByAffiliation) {
      const { data: affiliations } = await req.supabaseAdmin
        .from('lead_affiliations').select('lead_id').eq('user_id', parseInt(req.query.affiliated_user_id))
      affiliatedFilterIds = (affiliations || []).map(a => a.lead_id)
      if (affiliatedFilterIds.length === 0) return res.json(emptyResult)
    }

    const applyBaseFilters = (q) => {
      q = applyLeadScope(q, scope)
      if (affiliatedFilterIds) q = q.in('id', affiliatedFilterIds)
      if (req.query.date_from) q = q.gte('created_at', req.query.date_from)
      if (req.query.date_to) q = q.lte('created_at', req.query.date_to)
      // Exclure les "leads virtuels" representant des branches (crees par
      // dispatch native pour tracker les conversations dans /chat).
      // metadata->>'is_branch' = 'true' signale ces lignes.
      q = q.or('metadata->>is_branch.is.null,metadata->>is_branch.neq.true')
      return q
    }

    const applyTableFilters = (q) => {
      if (req.query.company) q = q.eq('company', req.query.company)
      if (req.query.type) q = q.eq('type', req.query.type)
      if (req.query.status) q = q.eq('status', req.query.status)
      if (req.query.branch) q = q.eq('branch', req.query.branch)
      if (req.query.source) q = q.eq('source', req.query.source)
      if (req.query.search) {
        // Sanitize: strip PostgREST special chars to prevent filter injection
        const s = req.query.search.replace(/[,.()"'\\]/g, '')
        if (s) q = q.or(`name.ilike.%${s}%,phone.ilike.%${s}%,city.ilike.%${s}%,details.ilike.%${s}%`)
      }
      return q
    }

    // ── Query 1: Stats (date-scoped only, no table filters) — lightweight select ──
    let statsQuery = supabase.from('leads').select('status, company, type')
    statsQuery = applyBaseFilters(statsQuery)
    const { data: statsRows, error: statsErr } = await statsQuery
    if (statsErr) throw statsErr

    const stats = {
      total: statsRows.length,
      new: 0, sent_to_branch: 0, in_progress: 0, handled: 0, not_relevant: 0, no_answer: 0,
      by_company: {}, by_type: {},
    }
    for (const l of statsRows) {
      if (stats[l.status] !== undefined) stats[l.status]++
      stats.by_company[l.company] = (stats.by_company[l.company] || 0) + 1
      stats.by_type[l.type] = (stats.by_type[l.type] || 0) + 1
    }

    // ── Query 2: Paginated leads (all filters + count) ──
    let leadsQuery = supabase.from('leads').select('*', { count: 'exact' })
    leadsQuery = applyBaseFilters(leadsQuery)
    leadsQuery = applyTableFilters(leadsQuery)
    // Sort by updated_at so leads with new bot activity surface back to the top
    // — created_at would hide a re-engaged lead behind brand-new ones.
    leadsQuery = leadsQuery.order('updated_at', { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1)

    const { data: leads, count: totalFiltered, error: leadsErr } = await leadsQuery
    if (leadsErr) throw leadsErr

    // ── Enrich with latest Maskyoo user_name per phone ──
    const phones = [...new Set((leads || []).map(l => l.phone).filter(Boolean))]
    if (phones.length > 0) {
      const { data: callRows } = await req.supabaseAdmin
        .from('calls')
        .select('cdr_ani, user_name, start_call')
        .in('cdr_ani', phones)
        .order('start_call', { ascending: false })
      if (callRows?.length) {
        const phoneToUser = {}
        for (const c of callRows) {
          if (!phoneToUser[c.cdr_ani]) phoneToUser[c.cdr_ani] = c.user_name
        }
        for (const lead of leads) {
          if (lead.phone && phoneToUser[lead.phone]) lead.maskyoo_user = phoneToUser[lead.phone]
        }
      }
    }

    // ── Enrich with creator name per user_id (admin/super_admin only) ──
    if (canFilterByAffiliation && leads?.length) {
      const userIds = [...new Set(leads.map(l => l.user_id).filter(Boolean))]
      if (userIds.length > 0) {
        const { data: userRows } = await req.supabaseAdmin
          .from('users')
          .select('id, first_name, email')
          .in('id', userIds)
        if (userRows?.length) {
          const idToName = {}
          for (const u of userRows) idToName[u.id] = u.first_name || u.email
          for (const lead of leads) {
            if (lead.user_id && idToName[lead.user_id]) lead.creator_name = idToName[lead.user_id]
          }
        }
      }
    }

    res.json({ leads: leads || [], stats, total: totalFiltered ?? 0, page, page_size: pageSize })
  } catch (err) {
    console.error('[leads]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// GET /api/leads/stats — aggregated KPIs for the admin dashboard
// Scoped via getLeadScope so each role only counts what it can see.
// Returned shape is the union of every chart the dashboard renders, so the
// frontend only needs one query for the whole "leads" panel.
router.get('/leads/stats', checkRole('admin', 'marketeur', 'branch'), async (req, res) => {
  try {
    const sb = req.supabaseAdmin || req.supabase
    const empty = {
      total: 0, status: {}, by_company: {}, by_type: {}, by_source: [], by_branch: [],
      series: [], top_marketers: [], dispatch: { branches: 0, dispatch_enabled: 0, missing_whatsapp: 0, queued: 0 },
      avg_time_to_handle_seconds: null,
    }

    const scope = await getLeadScope(req)
    if (scope.scope === 'none') return res.json(empty)
    if ((scope.scope === 'branches' || scope.scope === 'affiliations') && scope.value.length === 0) {
      return res.json(empty)
    }

    let q = sb.from('leads').select('id, status, company, type, source, branch, branch_id, created_at, dispatched_at, updated_at')
    q = applyLeadScope(q, scope)
    if (req.query.date_from) q = q.gte('created_at', req.query.date_from)
    if (req.query.date_to) q = q.lte('created_at', req.query.date_to)
    // Exclure les leads virtuels representant des branches (cf. /leads list).
    q = q.or('metadata->>is_branch.is.null,metadata->>is_branch.neq.true')
    // Cap to keep the payload bounded; for huge orgs we'd move this to SQL aggregates,
    // but at current volumes a single 5k-row scan is faster than 5 round-trips.
    q = q.order('created_at', { ascending: false }).limit(5000)
    const { data: rows, error } = await q
    if (error) throw error

    const status = {}, by_company = {}, by_type = {}, by_source = {}, by_branch = {}
    const dayBuckets = {}
    let timeToHandleSum = 0, timeToHandleCount = 0
    let queued = 0

    for (const l of rows || []) {
      status[l.status] = (status[l.status] || 0) + 1
      if (l.status === 'queued_for_dispatch') queued++
      if (l.company) by_company[l.company] = (by_company[l.company] || 0) + 1
      if (l.type) by_type[l.type] = (by_type[l.type] || 0) + 1
      const src = l.source || 'unknown'
      by_source[src] = (by_source[src] || 0) + 1
      const br = l.branch || '—'
      if (!by_branch[br]) by_branch[br] = { count: 0, handled: 0 }
      by_branch[br].count++
      if (l.status === 'handled') by_branch[br].handled++

      const day = (l.created_at || '').slice(0, 10)
      if (day) {
        if (!dayBuckets[day]) dayBuckets[day] = { date: day, total: 0, handled: 0, lost: 0 }
        dayBuckets[day].total++
        if (l.status === 'handled') dayBuckets[day].handled++
        if (l.status === 'not_relevant' || l.status === 'no_answer') dayBuckets[day].lost++
      }

      if (l.status === 'handled' && l.created_at && l.updated_at) {
        const diff = (new Date(l.updated_at) - new Date(l.created_at)) / 1000
        if (diff > 0) { timeToHandleSum += diff; timeToHandleCount++ }
      }
    }

    const series = Object.values(dayBuckets).sort((a, b) => a.date.localeCompare(b.date))
    const sourceArr = Object.entries(by_source).map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count).slice(0, 10)
    const branchArr = Object.entries(by_branch).map(([branch, v]) => ({ branch, count: v.count, handled: v.handled }))
      .sort((a, b) => b.count - a.count).slice(0, 12)

    // Top marketers — only when caller can see across users
    let top_marketers = []
    if ((scope.scope === 'all' || scope.scope === 'company') && (rows?.length || 0) > 0) {
      const leadIds = rows.map(r => r.id)
      const { data: affs } = await sb.from('lead_affiliations')
        .select('user_id, lead_id, source')
        .in('lead_id', leadIds)
      const byUser = {}
      for (const a of affs || []) {
        if (!byUser[a.user_id]) byUser[a.user_id] = { user_id: a.user_id, count: 0, capture: 0, handled: 0 }
        byUser[a.user_id].count++
        if (a.source === 'capture_link') byUser[a.user_id].capture++
      }
      // Cross-ref handled status
      const leadStatusById = Object.fromEntries(rows.map(r => [r.id, r.status]))
      for (const a of affs || []) {
        if (leadStatusById[a.lead_id] === 'handled') byUser[a.user_id].handled++
      }
      const userIds = Object.keys(byUser).map(Number)
      if (userIds.length > 0) {
        const { data: users } = await sb.from('users').select('id, first_name, last_name, email, role').in('id', userIds)
        const idToUser = Object.fromEntries((users || []).map(u => [u.id, u]))
        top_marketers = Object.values(byUser)
          .map(u => {
            const info = idToUser[u.user_id]
            const name = info ? (info.first_name || info.email) : `#${u.user_id}`
            return { ...u, name, role: info?.role || null }
          })
          .filter(u => u.role === 'marketeur' || u.role === 'admin' || u.role === 'super_admin')
          .sort((a, b) => b.count - a.count)
          .slice(0, 10)
      }
    }

    // Branch / dispatch readiness — independent of date range, scoped by role
    let dispatch_branches = 0, dispatch_enabled = 0, dispatch_missing_wa = 0
    {
      let bq = sb.from('branches').select('id, dispatch_enabled, whatsapp_phone, user_id')
      if (req.user.role === 'branch') {
        const { data: ub } = await sb.from('user_branches').select('branch_id').eq('user_id', req.user.user_id)
        const ids = (ub || []).map(r => r.branch_id)
        if (ids.length === 0) bq = bq.eq('id', -1)
        else bq = bq.in('id', ids)
      } else if (req.user.role === 'admin' && req.user.enterprise) {
        const ownerId = await resolveCompanyOwnerId(sb, req.user.enterprise)
        if (ownerId) bq = bq.eq('user_id', ownerId)
      }
      const { data: brs } = await bq
      for (const b of brs || []) {
        dispatch_branches++
        if (b.dispatch_enabled) dispatch_enabled++
        if (b.dispatch_enabled && !b.whatsapp_phone) dispatch_missing_wa++
      }
    }

    res.json({
      total: rows?.length || 0,
      status, by_company, by_type,
      by_source: sourceArr,
      by_branch: branchArr,
      series,
      top_marketers,
      dispatch: {
        branches: dispatch_branches,
        dispatch_enabled,
        missing_whatsapp: dispatch_missing_wa,
        queued,
      },
      avg_time_to_handle_seconds: timeToHandleCount > 0 ? Math.round(timeToHandleSum / timeToHandleCount) : null,
    })
  } catch (err) {
    console.error('[leads/stats]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// GET /api/leads/:id
router.get('/leads/:id', checkRole('admin', 'marketeur', 'branch'), async (req, res) => {
  try {
    if (!await canAccessLead(req, req.params.id)) return res.status(404).json({ error: 'Lead introuvable' })
    const { data, error } = await req.supabaseAdmin.from('leads').select('*').eq('id', req.params.id).single()
    if (error) throw error
    if (!data) return res.status(404).json({ error: 'Lead introuvable' })
    res.json({ lead: data })
  } catch (err) {
    console.error('[leads]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// GET /api/leads/:id/calls — Maskyoo calls for a lead (matched by phone)
router.get('/leads/:id/calls', checkRole('admin', 'marketeur', 'branch'), async (req, res) => {
  try {
    if (!await canAccessLead(req, req.params.id)) return res.status(404).json({ error: 'Lead introuvable' })
    const { data: lead } = await req.supabaseAdmin.from('leads').select('phone').eq('id', req.params.id).single()
    if (!lead) return res.status(404).json({ error: 'Lead introuvable' })

    const { data: calls, error: callsErr } = await req.supabaseAdmin
      .from('calls')
      .select('cdr_uniqueid, start_call, end_call, call_duration, cdr_ani, cdr_ddi, user_phone, user_name, call_status, onetouch, gclid, cdr_meta_data')
      .eq('cdr_ani', lead.phone)
      .order('start_call', { ascending: false })
      .limit(50)

    if (callsErr) throw callsErr
    res.json({ calls: calls || [] })
  } catch (err) {
    console.error('[leads/calls]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// GET /api/leads/:id/activities — activity timeline for a lead
router.get('/leads/:id/activities', checkRole('admin', 'marketeur', 'branch'), async (req, res) => {
  try {
    if (!await canAccessLead(req, req.params.id)) return res.status(404).json({ error: 'Lead introuvable' })

    const { data, error } = await req.supabaseAdmin
      .from('lead_activities')
      .select('*')
      .eq('lead_id', req.params.id)
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) throw error
    res.json({ activities: data || [] })
  } catch (err) {
    console.error('[lead-activities]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// POST /api/leads — UPSERT: merge by normalized phone + user_id
router.post('/leads', checkRole('admin', 'marketeur'), async (req, res) => {
  try {
    const { name } = req.body
    const phone = normalizePhone(req.body.phone)
    if (!name || !phone) return res.status(400).json({ error: 'name et phone requis' })

    const serviceNormalized = normalizeService(req.body.service_requested)
    const company = req.body.company || resolveCompany(serviceNormalized)

    // Company admin cannot create leads for another company
    if (req.user.enterprise && company !== req.user.enterprise) {
      return res.status(403).json({ error: `Impossible de creer un lead ${company} (vous etes ${req.user.enterprise})` })
    }

    // Auto-resolve branch: fixed branch (Udi services → אודי) or city→branch index
    let branch = req.body.branch || resolveFixedBranch(serviceNormalized) || null
    if (!branch && req.body.city && company === 'babait') {
      const { data: idx } = await req.supabase
        .from('city_branch_index')
        .select('branch_name')
        .eq('city', req.body.city)
        .limit(1)
      if (idx && idx.length > 0) branch = idx[0].branch_name
    }

    // Resolve branch_id from (company owner, branch name) — keep branch text for legacy compat
    const companyOwnerId = await resolveCompanyOwnerId(req.supabaseAdmin, company)
    const branchId = branch ? await resolveBranchId(req.supabaseAdmin, companyOwnerId, branch) : null

    // Check for existing lead by normalized phone + user_id
    const { data: existing } = await req.supabase
      .from('leads')
      .select('*')
      .eq('user_id', req.user.user_id)
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

      const { data, error } = await req.supabase
        .from('leads')
        .update(updates)
        .eq('id', lead.id)
        .select()
        .single()

      if (error) throw error

      // Log enrichment activity
      await req.supabaseAdmin.from('lead_activities').insert({
        lead_id: data.id,
        user_id: req.user.user_id,
        action: 'enriched',
        metadata: { source: req.body.source, lead_channel: req.body.lead_channel, service_requested: serviceNormalized },
        actor: req.user.email || 'admin',
      }).then(() => {}).catch(e => console.error('[lead-activity]', e.message))

      // Auto-affiliate lead to creator
      const { error: mergeAffErr } = await req.supabaseAdmin.from('lead_affiliations').upsert({
        lead_id: data.id,
        user_id: req.user.user_id,
        source: 'manual',
      }, { onConflict: 'lead_id,user_id' })
      if (mergeAffErr) console.error('[lead-affiliation] merge failed:', mergeAffErr.message, mergeAffErr.details)

      return res.status(200).json({ lead: data, merged: true })
    }

    // Create new lead
    const insert = {
      user_id: req.user.user_id,
      company,
      type: req.body.type || 'patient',
      name, phone,
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
      status: req.body.status || 'new',
      position_type: req.body.position_type || null,
      experience: req.body.experience ?? null,
      ip_address: req.body.ip_address || null,
      campaign: req.body.campaign || null,
      custom_fields: req.body.custom_fields || {},
      metadata: req.body.metadata || null,
    }

    let { data, error } = await req.supabase
      .from('leads')
      .insert(insert)
      .select()
      .single()

    // Race: another request created the same (user_id, phone) lead between our SELECT and INSERT.
    // The unique index in migration 033 guarantees only one wins — the loser retries as a merge.
    if (error?.code === '23505') {
      const { data: winner } = await req.supabase
        .from('leads')
        .select('*')
        .eq('user_id', req.user.user_id)
        .eq('phone', phone)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (winner) {
        return res.status(200).json({ lead: winner, merged: true, raced: true })
      }
    }
    if (error) throw error

    // Log creation activity
    await req.supabaseAdmin.from('lead_activities').insert({
      lead_id: data.id,
      user_id: req.user.user_id,
      action: 'created',
      metadata: { source: data.source, lead_channel: data.lead_channel },
      actor: req.user.email || 'admin',
    }).then(() => {}).catch(e => console.error('[lead-activity]', e.message))

    // Auto-affiliate lead to creator
    const { error: affErr } = await req.supabaseAdmin.from('lead_affiliations').upsert({
      lead_id: data.id,
      user_id: req.user.user_id,
      source: 'manual',
    }, { onConflict: 'lead_id,user_id' })
    if (affErr) console.error('[lead-affiliation] create failed:', affErr.message, affErr.details)

    // Respond immediately — don't block on auto-dispatch
    res.status(201).json({ lead: data })

    // Auto-dispatch in background (fire-and-forget). We log the actual outcome
    // so silent failures (no whatsapp account, branch disabled, etc.) are visible.
    if (data.branch) {
      req.supabase
        .from('dispatch_config')
        .select('auto_dispatch')
        .eq('user_id', req.user.user_id)
        .limit(1)
        .maybeSingle()
        .then(async ({ data: config }) => {
          if (!config?.auto_dispatch) return
          const result = await dispatchLead(req.supabaseAdmin || req.supabase, data)
          if (result?.error) {
            console.warn(`[leads/auto-dispatch] lead=${data.id} error: ${result.error}`)
          } else if (result?.queued) {
            console.log(`[leads/auto-dispatch] lead=${data.id} queued (out of schedule)`)
          } else if (result?.success) {
            console.log(`[leads/auto-dispatch] lead=${data.id} dispatched to ${data.branch}`)
          }
        })
        .catch(err => console.error('[leads/auto-dispatch]', err.message))
    }
  } catch (err) {
    console.error('[leads]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// PUT /api/leads/:id
router.put('/leads/:id', checkRole('admin', 'marketeur', 'branch'), async (req, res) => {
  try {
    const { id } = req.params
    const allowed = [
      'company', 'type', 'name', 'phone', 'email', 'city', 'branch', 'coordinator',
      'source', 'lead_channel', 'service_requested', 'service_type', 'details',
      'status', 'position_type', 'experience', 'ip_address', 'campaign',
      'custom_fields', 'metadata',
    ]

    if (!await canAccessLead(req, id)) return res.status(404).json({ error: 'Lead introuvable' })

    const sb = req.supabaseAdmin || req.supabase
    const { data: before } = await sb.from('leads').select('*').eq('id', id).single()
    if (!before) return res.status(404).json({ error: 'Lead introuvable' })

    const updates = { updated_at: new Date().toISOString() }
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key]
    }

    // If branch text changed, recompute branch_id from (company, branch)
    if (updates.branch !== undefined && updates.branch !== before.branch) {
      const company = updates.company || before.company
      const ownerId = await resolveCompanyOwnerId(req.supabaseAdmin, company)
      updates.branch_id = updates.branch ? await resolveBranchId(req.supabaseAdmin, ownerId, updates.branch) : null
    }

    const { data, error } = await sb.from('leads').update(updates).eq('id', id).select().single()

    if (error) throw error
    if (!data) return res.status(404).json({ error: 'Lead introuvable' })

    // Log changes as activity
    const changes = {}
    const skipFields = ['updated_at', 'custom_fields', 'metadata']
    for (const key of allowed) {
      if (skipFields.includes(key)) continue
      if (req.body[key] !== undefined && String(req.body[key]) !== String(before[key] ?? '')) {
        changes[key] = { from: before[key] ?? null, to: req.body[key] }
      }
    }
    if (Object.keys(changes).length > 0) {
      const action = changes.status ? 'status_changed' : 'updated'
      const metadata = {}
      if (changes.status && typeof req.body.status_comment === 'string' && req.body.status_comment.trim()) {
        metadata.comment = req.body.status_comment.trim()
      }
      await req.supabaseAdmin.from('lead_activities').insert({
        lead_id: id,
        user_id: req.user.user_id,
        action,
        changes,
        metadata: Object.keys(metadata).length ? metadata : null,
        actor: req.user.email || 'admin',
      }).then(() => {}).catch(e => console.error('[lead-activity]', e.message))
    }

    res.json({ lead: data })
  } catch (err) {
    console.error('[leads]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// DELETE /api/leads/:id (admin only — company admin scoped to their company)
router.delete('/leads/:id', checkRole('admin'), async (req, res) => {
  try {
    const { id } = req.params
    if (!await canAccessLead(req, id)) return res.status(404).json({ error: 'Lead introuvable' })
    const { error } = await req.supabaseAdmin.from('leads').delete().eq('id', id)
    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    console.error('[leads]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// ─── WhatsApp Dispatch ──────────────────────────────────

const FIELD_EMOJI = {
  company: '📋', name: '👤', phone: '📱', email: '📧', city: '📍',
  branch: '🏢', coordinator: '👷', source: '🔗', lead_channel: '📡',
  service_requested: '🏥', service_type: '📋', details: '💬',
  position_type: '💼', experience: '⭐', campaign: '📣',
}

function buildDispatchMessage(lead, config) {
  const fields = config?.message_fields || ['company', 'name', 'phone', 'email', 'city', 'service_requested', 'service_type', 'details', 'source']
  const lines = []
  if (config?.message_header) lines.push(config.message_header, '')
  for (const field of fields) {
    const value = lead[field]
    if (!value && value !== false) continue
    const emoji = FIELD_EMOJI[field] || '•'
    if (field === 'name') lines.push(`${emoji} *${value}*`)
    else if (field === 'company') lines.push(`${emoji} *${String(value).toUpperCase()}*`)
    else lines.push(`${emoji} ${value}`)
  }
  lines.push(`\n🆔 Lead #${lead.id}`)
  if (config?.message_footer) lines.push('', config.message_footer)
  return lines.join('\n')
}

function isWithinSchedule(config) {
  if (!config) return true
  const now = new Date()
  const day = now.getDay()
  const hour = now.getHours()
  const days = config.schedule_days || [0, 1, 2, 3, 4, 5, 6]
  if (!days.includes(day)) return false
  const start = config.schedule_hour_start ?? 0
  const end = config.schedule_hour_end ?? 24
  return hour >= start && hour < end
}

async function dispatchLead(supabase, lead, { skipScheduleCheck = false } = {}) {
  if (!lead.branch_id && !lead.branch) return { error: 'Aucune branche assignee a ce lead' }

  // Prefer branch_id (avoids cross-company name collisions), fallback to (user_id, name) lookup
  let branchQuery = supabase.from('branches').select('*')
  if (lead.branch_id) branchQuery = branchQuery.eq('id', lead.branch_id)
  else branchQuery = branchQuery.eq('user_id', lead.user_id).eq('name', lead.branch)
  const { data: branch } = await branchQuery.limit(1).maybeSingle()

  if (!branch) return { error: `Branche "${lead.branch}" introuvable` }
  if (!branch.dispatch_enabled) return { error: `Dispatch desactive pour "${branch.name}"` }
  if (!branch.whatsapp_phone) return { error: `Pas de numero WhatsApp pour "${branch.name}"` }

  // Scope dispatch_config to the lead owner (= company admin)
  const { data: config } = await supabase
    .from('dispatch_config').select('*')
    .eq('user_id', lead.user_id)
    .limit(1).maybeSingle()

  if (!skipScheduleCheck && !isWithinSchedule(config)) {
    await supabase.from('leads').update({ status: 'queued_for_dispatch', updated_at: new Date().toISOString() }).eq('id', lead.id)
    return { queued: true }
  }

  // Prefer dispatch-dedicated inbox, fallback to main WhatsApp inbox
  let accountId = null
  if (config?.dispatch_inbox_id) {
    const { data: di } = await supabase.from('inboxes').select('unipile_account_id')
      .eq('id', config.dispatch_inbox_id).not('unipile_account_id', 'is', null).limit(1).maybeSingle()
    if (di) accountId = di.unipile_account_id
  }
  if (!accountId) {
    const { data: inboxes } = await supabase.from('inboxes').select('unipile_account_id')
      .eq('channel_type', 'whatsapp')
      .not('unipile_account_id', 'is', null).limit(1)
    if (inboxes?.length) accountId = inboxes[0].unipile_account_id
  }
  if (!accountId) return { error: 'Aucune connexion WhatsApp configuree' }

  const message = buildDispatchMessage(lead, config)

  // Native chat path (kill-switch gated): tracker le dispatch dans /chat
  // Le coordinateur de la branche devient un "contact" virtuel (lead) avec
  // metadata.branch_id pour qu'on puisse filtrer ces conversations dans l'UI.
  let result = null
  let nativeConversationId = null
  if (isNativeChatEnabledFor(accountId)) {
    nativeConversationId = await sendNativeDispatch(supabase, {
      userId: lead.user_id,
      unipileAccountId: accountId,
      branchPhone: branch.whatsapp_phone,
      branchName: branch.name,
      branchId: branch.id,
      message,
      leadId: lead.id,
    })
  }

  // Fallback: envoi direct Unipile (legacy ou kill-switch off)
  if (!nativeConversationId) {
    result = await sendMessage(accountId, branch.whatsapp_phone, message)
  }

  await supabase.from('leads').update({
    status: 'sent_to_branch',
    dispatched_at: new Date().toISOString(),
    dispatch_message_id: result?.chat_id || result?.id || null,
    updated_at: new Date().toISOString(),
  }).eq('id', lead.id)

  return { success: true }
}

/**
 * Dispatch via le natif: trace le dispatch dans /chat en creant une conversation
 * sur un "lead virtuel" representant le coordinateur de la branche (phone =
 * whatsapp_phone, metadata.branch_id pour filtrage). Quand la branche repond,
 * le webhook Unipile retombera sur la meme conversation.
 *
 * @returns {Promise<string|null>} chat_conversations.id ou null si rien fait.
 */
async function sendNativeDispatch(supabase, { userId, unipileAccountId, branchPhone, branchName, branchId, message, leadId }) {
  try {
    const { data: inbox } = await supabase
      .from('chat_inboxes')
      .select('id, user_id')
      .eq('unipile_account_id', unipileAccountId)
      .eq('channel_type', 'whatsapp_unipile')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()
    if (!inbox) return null

    // Le lead virtuel representant la branche (idempotent par phone). On passe par
    // normalizePhone (digits-only puis re-prefix) pour absorber espaces/tirets cote
    // branches.whatsapp_phone — sinon "+972 50-858-8168" ne matchera jamais le
    // "+972508588168" qu'Unipile renverra dans le webhook reply.
    const normalizedPhone = normalizePhone(branchPhone) || (branchPhone.startsWith('+') ? branchPhone : `+${branchPhone}`)
    let { data: branchLead } = await supabase
      .from('leads')
      .select('id, metadata')
      .eq('user_id', userId)
      .eq('phone', normalizedPhone)
      .limit(1)
      .maybeSingle()
    if (!branchLead) {
      const r = await supabase
        .from('leads')
        .insert({
          user_id: userId,
          name: branchName || normalizedPhone,
          phone: normalizedPhone,
          source: 'dispatch',
          lead_channel: 'whatsapp',
          status: 'new',
          metadata: { is_branch: true, branch_id: branchId },
        })
        .select('id, metadata')
        .single()
      if (r.error) throw r.error
      branchLead = r.data
    } else if (!branchLead.metadata?.is_branch) {
      // Tag the existing lead so the UI can filter
      await supabase
        .from('leads')
        .update({ metadata: { ...(branchLead.metadata || {}), is_branch: true, branch_id: branchId } })
        .eq('id', branchLead.id)
    }

    // Find or create conversation
    let { data: conv } = await supabase
      .from('chat_conversations')
      .select('id')
      .eq('user_id', inbox.user_id)
      .eq('inbox_id', inbox.id)
      .eq('contact_id', branchLead.id)
      .in('status', ['open', 'pending'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!conv) {
      const r = await supabase
        .from('chat_conversations')
        .insert({
          user_id: inbox.user_id,
          inbox_id: inbox.id,
          contact_id: branchLead.id,
          channel: 'whatsapp_unipile',
          status: 'open',
          // ai_disabled=true: la conversation dispatch sert a tracker les replies
          // du coordinateur de branche, pas a discuter avec lui. Sans ce flag,
          // handleNativeMessage va lancer Shira sur le coordinateur des qu'il
          // repond (ex: "OK on l'a appele") -> spam d'un humain non-client.
          ai_disabled: true,
          subject: `Dispatch ${branchName}`,
          metadata: { is_dispatch: true, branch_id: branchId },
        })
        .select('id')
        .single()
      if (r.error) throw r.error
      conv = r.data
    }

    // Send the dispatch message — relay handled by native-messaging
    const result = await sendNativeMessage({
      supabase,
      userId: inbox.user_id,
      conversationId: conv.id,
      senderType: 'bot',
      content: message,
      contentType: 'text',
      metadata: { source_kind: 'dispatch', dispatched_lead_id: leadId, branch_id: branchId },
    })
    if (result?.error) {
      console.error('[dispatch native] sendNativeMessage error:', result.error)
      return null
    }

    return conv.id
  } catch (err) {
    console.error('[dispatch native] failed:', err.message)
    return null
  }
}

// POST /api/leads/:id/dispatch — send lead to branch via WhatsApp
router.post('/leads/:id/dispatch', checkRole('admin', 'marketeur', 'branch'), async (req, res) => {
  try {
    const { id } = req.params
    if (!await canAccessLead(req, id)) return res.status(404).json({ error: 'Lead introuvable' })
    const sb = req.supabaseAdmin || req.supabase
    const { data: lead, error: leadErr } = await sb.from('leads').select('*').eq('id', id).single()
    if (leadErr || !lead) return res.status(404).json({ error: 'Lead introuvable' })

    const result = await dispatchLead(req.supabaseAdmin || req.supabase, lead, { skipScheduleCheck: true })
    if (result.error) return res.status(400).json({ error: result.error })

    // Log dispatch activity
    await req.supabaseAdmin.from('lead_activities').insert({
      lead_id: id,
      user_id: req.user.user_id,
      action: 'dispatched',
      metadata: { branch: lead.branch },
      actor: req.user.email || 'admin',
    }).then(() => {}).catch(e => console.error('[lead-activity]', e.message))

    const { data: updated } = await sb.from('leads').select('*').eq('id', id).single()
    res.json({ success: true, lead: updated })
  } catch (err) {
    console.error('[leads/dispatch]', err.message)
    res.status(500).json({ error: err.message || 'Erreur interne' })
  }
})

// POST /api/leads/:id/comment — add a comment to lead timeline
router.post('/leads/:id/comment', checkRole('admin', 'marketeur', 'branch'), async (req, res) => {
  try {
    const { id } = req.params
    const { comment } = req.body
    if (!comment?.trim()) return res.status(400).json({ error: 'Comment vide' })
    if (!await canAccessLead(req, id)) return res.status(404).json({ error: 'Lead introuvable' })

    const { error } = await req.supabaseAdmin.from('lead_activities').insert({
      lead_id: id,
      user_id: req.user.user_id,
      action: 'comment',
      metadata: { text: comment.trim() },
      actor: req.user.email || 'admin',
    })
    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    console.error('[leads/comment]', err.message)
    res.status(500).json({ error: err.message || 'Erreur interne' })
  }
})

// ─── Lead Field Definitions ─────────────────────────────

// GET /api/lead-fields
router.get('/lead-fields', checkRole('admin', 'marketeur', 'branch'), async (req, res) => {
  try {
    const sb = ['super_admin', 'admin'].includes(req.user.role) ? (req.supabaseAdmin || req.supabase) : req.supabase
    let query = sb.from('lead_field_definitions').select('*')
    if (!['super_admin', 'admin'].includes(req.user.role)) {
      query = query.eq('user_id', req.user.user_id)
    }
    const { data, error } = await query.order('display_order', { ascending: true })

    if (error) throw error
    res.json({ fields: data || [] })
  } catch (err) {
    console.error('[lead-fields]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// POST /api/lead-fields
router.post('/lead-fields', checkRole('admin'), async (req, res) => {
  try {
    const { field_key, label, field_type, options, required, display_order } = req.body
    if (!field_key || !label) return res.status(400).json({ error: 'field_key et label requis' })

    const { data, error } = await req.supabase
      .from('lead_field_definitions')
      .insert({
        user_id: req.user.user_id,
        field_key,
        label,
        field_type: field_type || 'text',
        options: options || null,
        required: required || false,
        display_order: display_order || 0,
      })
      .select()
      .single()

    if (error) throw error
    res.status(201).json({ field: data })
  } catch (err) {
    console.error('[lead-fields]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// PUT /api/lead-fields/:id
router.put('/lead-fields/:id', checkRole('admin'), async (req, res) => {
  try {
    const { id } = req.params
    const allowed = ['field_key', 'label', 'field_type', 'options', 'required', 'display_order']
    const updates = {}
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key]
    }

    const { data, error } = await req.supabase
      .from('lead_field_definitions')
      .update(updates)
      .eq('id', id)
      .eq('user_id', req.user.user_id)
      .select()
      .single()

    if (error) throw error
    if (!data) return res.status(404).json({ error: 'Champ introuvable' })
    res.json({ field: data })
  } catch (err) {
    console.error('[lead-fields]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// DELETE /api/lead-fields/:id
router.delete('/lead-fields/:id', checkRole('admin'), async (req, res) => {
  try {
    const { id } = req.params
    const { error } = await req.supabase
      .from('lead_field_definitions')
      .delete()
      .eq('id', id)
      .eq('user_id', req.user.user_id)

    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    console.error('[lead-fields]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// ─── CSV Import ──────────────────────────────────────────

// POST /api/leads/import
router.post('/leads/import', checkRole('admin'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Fichier requis' })

    const content = req.file.buffer.toString('utf-8')
    const rows = parseCSV(content)
    if (rows.length < 2) return res.status(400).json({ error: 'Fichier vide ou invalide' })

    const headers = rows[0]
    const mapping = JSON.parse(req.body.column_mapping || '{}')
    const company = req.body.company || 'babait'
    const type = req.body.type || 'patient'

    // Load city→branch index for auto-routing
    const { data: cityIdx } = await req.supabase
      .from('city_branch_index')
      .select('city, branch_name')
    const cityMap = {}
    for (const c of cityIdx || []) cityMap[c.city] = c.branch_name

    const leads = []
    let skipped = 0
    const errors = []

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]
      if (row.length === 0 || (row.length === 1 && !row[0])) { skipped++; continue }

      const lead = { user_id: req.user.user_id, company, type, custom_fields: {} }
      const standardFields = ['name', 'phone', 'email', 'city', 'branch', 'coordinator', 'source', 'lead_channel', 'service_requested', 'service_type', 'details', 'status', 'position_type', 'campaign', 'ip_address']

      for (const [colIdx, targetField] of Object.entries(mapping)) {
        const value = row[parseInt(colIdx)] || ''
        if (!value.trim()) continue

        if (standardFields.includes(targetField)) {
          lead[targetField] = value.trim()
        } else if (targetField === 'experience') {
          lead.experience = ['כן', 'true', 'yes', '1', 'TRUE'].includes(value.trim().toLowerCase())
        } else if (targetField.startsWith('custom:')) {
          lead.custom_fields[targetField.replace('custom:', '')] = value.trim()
        }
      }

      if (!lead.name || !lead.phone) { skipped++; continue }

      // Normalize phone — drop rows whose phone can't be parsed (normalizePhone now
      // returns null for non-numeric junk instead of falling through to trimmed text).
      const normalized = normalizePhone(lead.phone)
      if (!normalized) { skipped++; continue }
      lead.phone = normalized

      // Normalize service_requested + auto-resolve company
      if (lead.service_requested) {
        lead.service_requested = normalizeService(lead.service_requested)
        if (!lead.company || lead.company === company) {
          lead.company = resolveCompany(lead.service_requested, lead.company)
        }
      }

      // Auto-resolve branch: fixed branch (Udi services → אודי) or city→branch index
      if (!lead.branch) {
        lead.branch = resolveFixedBranch(lead.service_requested) || null
      }
      if (!lead.branch && lead.city && lead.company === 'babait' && cityMap[lead.city]) {
        lead.branch = cityMap[lead.city]
      }

      if (!lead.status) lead.status = 'new'
      leads.push(lead)
    }

    // Batch insert (chunks of 500)
    let imported = 0
    for (let i = 0; i < leads.length; i += 500) {
      const chunk = leads.slice(i, i + 500)
      const { error: insertError } = await req.supabase
        .from('leads')
        .insert(chunk)
      if (insertError) {
        errors.push(`Batch ${Math.floor(i / 500)}: ${insertError.message}`)
      } else {
        imported += chunk.length
      }
    }

    res.json({ imported, skipped, errors, total_rows: rows.length - 1 })
  } catch (err) {
    console.error('[leads/import]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// Simple CSV parser (handles quoted fields with commas)
function parseCSV(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        field += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        row.push(field)
        field = ''
      } else if (ch === '\n' || (ch === '\r' && text[i + 1] === '\n')) {
        row.push(field)
        field = ''
        rows.push(row)
        row = []
        if (ch === '\r') i++
      } else if (ch === '\r') {
        row.push(field)
        field = ''
        rows.push(row)
        row = []
      } else {
        field += ch
      }
    }
  }
  if (field || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

// ─── Lead Documents ─────────────────────────────────────

const docUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats', 'text/']
    if (allowed.some(t => file.mimetype.startsWith(t))) cb(null, true)
    else cb(new Error('Type de fichier non supporte'))
  },
})

// GET /api/leads/:id/documents
router.get('/leads/:id/documents', checkRole('admin', 'marketeur', 'branch'), async (req, res) => {
  try {
    if (!await canAccessLead(req, req.params.id)) return res.status(404).json({ error: 'Lead introuvable' })
    const { data, error } = await req.supabaseAdmin
      .from('lead_documents')
      .select('*')
      .eq('lead_id', req.params.id)
      .order('created_at', { ascending: false })
    if (error) throw error
    res.json({ documents: data || [] })
  } catch (err) {
    console.error('[lead-documents]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// POST /api/leads/:id/documents
router.post('/leads/:id/documents', checkRole('admin', 'marketeur', 'branch'), docUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Fichier requis' })
    if (!await canAccessLead(req, req.params.id)) return res.status(404).json({ error: 'Lead introuvable' })

    const ext = req.file.originalname.split('.').pop()
    const filename = `lead-docs/${req.params.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

    const { error: uploadErr } = await req.supabaseAdmin.storage
      .from('chat-attachments')
      .upload(filename, req.file.buffer, { contentType: req.file.mimetype })
    if (uploadErr) throw uploadErr

    const { data: { publicUrl } } = req.supabaseAdmin.storage
      .from('chat-attachments')
      .getPublicUrl(filename)

    const { data, error } = await req.supabaseAdmin
      .from('lead_documents')
      .insert({
        lead_id: parseInt(req.params.id),
        uploaded_by: req.user.user_id,
        name: req.file.originalname,
        url: publicUrl,
        mime_type: req.file.mimetype,
        size: req.file.size,
      })
      .select()
      .single()

    if (error) throw error
    res.status(201).json({ document: data })
  } catch (err) {
    console.error('[lead-documents]', err.message)
    res.status(500).json({ error: err.message || 'Erreur interne' })
  }
})

// DELETE /api/leads/:id/documents/:docId
router.delete('/leads/:id/documents/:docId', checkRole('admin'), async (req, res) => {
  try {
    const { error } = await req.supabaseAdmin
      .from('lead_documents')
      .delete()
      .eq('id', req.params.docId)
      .eq('lead_id', req.params.id)
    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    console.error('[lead-documents]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// ─── Lead Affiliations ─────────────────────────────────

// GET /api/leads/:id/affiliations
router.get('/leads/:id/affiliations', checkRole('admin', 'marketeur', 'branch'), async (req, res) => {
  try {
    if (!await canAccessLead(req, req.params.id)) return res.status(404).json({ error: 'Lead introuvable' })
    const { data, error } = await req.supabaseAdmin
      .from('lead_affiliations')
      .select('id, user_id, source, created_at, users(id, email, first_name, last_name, role)')
      .eq('lead_id', req.params.id)
      .order('created_at', { ascending: true })
    if (error) throw error
    res.json({ affiliations: data || [] })
  } catch (err) {
    console.error('[lead-affiliations]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// POST /api/leads/:id/affiliations
router.post('/leads/:id/affiliations', checkRole('admin'), async (req, res) => {
  try {
    const { user_id } = req.body
    if (!user_id) return res.status(400).json({ error: 'user_id requis' })

    const { data, error } = await req.supabaseAdmin
      .from('lead_affiliations')
      .upsert({
        lead_id: parseInt(req.params.id),
        user_id: parseInt(user_id),
        source: 'manual',
      }, { onConflict: 'lead_id,user_id' })
      .select('id, user_id, source, created_at')
      .single()

    if (error) throw error
    res.status(201).json({ affiliation: data })
  } catch (err) {
    console.error('[lead-affiliations]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// DELETE /api/leads/:id/affiliations/:userId
router.delete('/leads/:id/affiliations/:userId', checkRole('admin'), async (req, res) => {
  try {
    const { error } = await req.supabaseAdmin
      .from('lead_affiliations')
      .delete()
      .eq('lead_id', req.params.id)
      .eq('user_id', req.params.userId)
    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    console.error('[lead-affiliations]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

export { dispatchLead }
export default router
