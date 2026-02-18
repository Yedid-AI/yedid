import { Router } from 'express'
import { checkRole } from '../middleware.js'
import { sendMessage } from '../unipile.js'
import multer from 'multer'

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })

const router = Router()

// ─── Leads CRUD ──────────────────────────────────────────

// GET /api/leads — list with filters + stats
router.get('/leads', checkRole('admin'), async (req, res) => {
  try {
    // Super admin sees all leads; admin sees only their own
    // Use select with count, and range(0, 9999) to bypass Supabase default 1000 limit
    let query = req.supabase.from('leads').select('*', { count: 'exact' })
    if (req.user.role !== 'super_admin') {
      query = query.eq('user_id', req.user.user_id)
    }
    query = query.order('created_at', { ascending: false }).range(0, 9999)

    const { data: allData, error } = await query
    if (error) throw error

    // Date range filter
    let dateFiltered = allData || []
    if (req.query.date_from) {
      const from = new Date(req.query.date_from)
      dateFiltered = dateFiltered.filter((l) => new Date(l.created_at) >= from)
    }
    if (req.query.date_to) {
      const to = new Date(req.query.date_to)
      dateFiltered = dateFiltered.filter((l) => new Date(l.created_at) <= to)
    }

    // Stats (from date-filtered data)
    const stats = {
      total: dateFiltered.length,
      new: dateFiltered.filter((l) => l.status === 'new').length,
      sent_to_branch: dateFiltered.filter((l) => l.status === 'sent_to_branch').length,
      in_progress: dateFiltered.filter((l) => l.status === 'in_progress').length,
      handled: dateFiltered.filter((l) => l.status === 'handled').length,
      not_relevant: dateFiltered.filter((l) => l.status === 'not_relevant').length,
      no_answer: dateFiltered.filter((l) => l.status === 'no_answer').length,
      by_company: {},
      by_type: {},
    }
    for (const l of dateFiltered) {
      stats.by_company[l.company] = (stats.by_company[l.company] || 0) + 1
      stats.by_type[l.type] = (stats.by_type[l.type] || 0) + 1
    }

    // Apply table filters
    let filtered = dateFiltered
    if (req.query.company) filtered = filtered.filter((l) => l.company === req.query.company)
    if (req.query.type) filtered = filtered.filter((l) => l.type === req.query.type)
    if (req.query.status) filtered = filtered.filter((l) => l.status === req.query.status)
    if (req.query.branch) filtered = filtered.filter((l) => l.branch === req.query.branch)
    if (req.query.source) filtered = filtered.filter((l) => l.source === req.query.source)
    if (req.query.search) {
      const s = req.query.search.toLowerCase()
      filtered = filtered.filter((l) =>
        l.name?.toLowerCase().includes(s) ||
        l.phone?.includes(s) ||
        l.city?.toLowerCase().includes(s) ||
        l.details?.toLowerCase().includes(s)
      )
    }

    // Pagination
    const page = Math.max(0, parseInt(req.query.page) || 0)
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.page_size) || 50))
    const totalFiltered = filtered.length
    const paginatedLeads = filtered.slice(page * pageSize, (page + 1) * pageSize)

    res.json({ leads: paginatedLeads, stats, total: totalFiltered, page, page_size: pageSize })
  } catch (err) {
    console.error('[leads]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// GET /api/leads/:id
router.get('/leads/:id', checkRole('admin'), async (req, res) => {
  try {
    let query = req.supabase.from('leads').select('*').eq('id', req.params.id)
    if (req.user.role !== 'super_admin') {
      query = query.eq('user_id', req.user.user_id)
    }
    const { data, error } = await query.single()
    if (error) throw error
    if (!data) return res.status(404).json({ error: 'Lead introuvable' })
    res.json({ lead: data })
  } catch (err) {
    console.error('[leads]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// POST /api/leads
router.post('/leads', checkRole('admin'), async (req, res) => {
  try {
    const { name, phone } = req.body
    if (!name || !phone) return res.status(400).json({ error: 'name et phone requis' })

    // Auto-resolve city → branch
    let branch = req.body.branch || null
    if (!branch && req.body.city) {
      const { data: idx } = await req.supabase
        .from('city_branch_index')
        .select('branch_name')
        .eq('user_id', req.user.user_id)
        .eq('city', req.body.city)
        .limit(1)
      if (idx && idx.length > 0) branch = idx[0].branch_name
    }

    const insert = {
      user_id: req.user.user_id,
      company: req.body.company || 'babait',
      type: req.body.type || 'patient',
      name, phone,
      email: req.body.email || null,
      city: req.body.city || null,
      branch,
      coordinator: req.body.coordinator || null,
      source: req.body.source || null,
      lead_channel: req.body.lead_channel || null,
      service_requested: req.body.service_requested || null,
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

    const { data, error } = await req.supabase
      .from('leads')
      .insert(insert)
      .select()
      .single()

    if (error) throw error

    // Auto-dispatch if configured
    if (data.branch) {
      try {
        const { data: config } = await req.supabase
          .from('dispatch_config')
          .select('auto_dispatch')
          .eq('user_id', req.user.user_id)
          .limit(1)
          .maybeSingle()

        if (config?.auto_dispatch) {
          const result = await dispatchLead(req.supabase, data)
          if (result.success || result.queued) {
            // Re-fetch updated lead
            const { data: refreshed } = await req.supabase.from('leads').select('*').eq('id', data.id).single()
            if (refreshed) return res.status(201).json({ lead: refreshed })
          }
        }
      } catch (dispatchErr) {
        console.log('[leads/auto-dispatch]', dispatchErr.message)
      }
    }

    res.status(201).json({ lead: data })
  } catch (err) {
    console.error('[leads]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// PUT /api/leads/:id
router.put('/leads/:id', checkRole('admin'), async (req, res) => {
  try {
    const { id } = req.params
    const allowed = [
      'company', 'type', 'name', 'phone', 'email', 'city', 'branch', 'coordinator',
      'source', 'lead_channel', 'service_requested', 'service_type', 'details',
      'status', 'position_type', 'experience', 'ip_address', 'campaign',
      'custom_fields', 'metadata',
    ]
    const updates = { updated_at: new Date().toISOString() }
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key]
    }

    let query = req.supabase.from('leads').update(updates).eq('id', id)
    if (req.user.role !== 'super_admin') {
      query = query.eq('user_id', req.user.user_id)
    }
    const { data, error } = await query.select().single()

    if (error) throw error
    if (!data) return res.status(404).json({ error: 'Lead introuvable' })
    res.json({ lead: data })
  } catch (err) {
    console.error('[leads]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// DELETE /api/leads/:id
router.delete('/leads/:id', checkRole('admin'), async (req, res) => {
  try {
    const { id } = req.params
    let query = req.supabase.from('leads').delete().eq('id', id)
    if (req.user.role !== 'super_admin') {
      query = query.eq('user_id', req.user.user_id)
    }
    const { error } = await query
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
  if (!lead.branch) return { error: 'Aucune branche assignee a ce lead' }

  const { data: branch } = await supabase
    .from('branches').select('*')
    .eq('user_id', lead.user_id).eq('name', lead.branch)
    .limit(1).maybeSingle()

  if (!branch) return { error: `Branche "${lead.branch}" introuvable` }
  if (!branch.dispatch_enabled) return { error: `Dispatch desactive pour "${lead.branch}"` }
  if (!branch.whatsapp_phone) return { error: `Pas de numero WhatsApp pour "${lead.branch}"` }

  const { data: config } = await supabase
    .from('dispatch_config').select('*')
    .eq('user_id', lead.user_id).limit(1).maybeSingle()

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
      .eq('user_id', lead.user_id).eq('channel_type', 'whatsapp')
      .not('unipile_account_id', 'is', null).limit(1)
    if (inboxes?.length) accountId = inboxes[0].unipile_account_id
  }
  if (!accountId) return { error: 'Aucune connexion WhatsApp configuree' }

  const message = buildDispatchMessage(lead, config)
  const result = await sendMessage(accountId, branch.whatsapp_phone, message)

  await supabase.from('leads').update({
    status: 'sent_to_branch',
    dispatched_at: new Date().toISOString(),
    dispatch_message_id: result?.chat_id || result?.id || null,
    updated_at: new Date().toISOString(),
  }).eq('id', lead.id)

  return { success: true }
}

// POST /api/leads/:id/dispatch — send lead to branch via WhatsApp
router.post('/leads/:id/dispatch', checkRole('admin'), async (req, res) => {
  try {
    const { id } = req.params
    let leadQuery = req.supabase.from('leads').select('*').eq('id', id)
    if (req.user.role !== 'super_admin') leadQuery = leadQuery.eq('user_id', req.user.user_id)
    const { data: lead, error: leadErr } = await leadQuery.single()
    if (leadErr || !lead) return res.status(404).json({ error: 'Lead introuvable' })

    const result = await dispatchLead(req.supabase, lead, { skipScheduleCheck: true })
    if (result.error) return res.status(400).json({ error: result.error })

    const { data: updated } = await req.supabase.from('leads').select('*').eq('id', id).single()
    res.json({ success: true, lead: updated })
  } catch (err) {
    console.error('[leads/dispatch]', err.message)
    res.status(500).json({ error: err.message || 'Erreur interne' })
  }
})

// ─── Lead Field Definitions ─────────────────────────────

// GET /api/lead-fields
router.get('/lead-fields', checkRole('admin'), async (req, res) => {
  try {
    let query = req.supabase.from('lead_field_definitions').select('*')
    if (req.user.role !== 'super_admin') {
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
      .eq('user_id', req.user.user_id)
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

      // Auto-resolve city → branch
      if (!lead.branch && lead.city && cityMap[lead.city]) {
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

export default router
