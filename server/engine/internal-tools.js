import { normalizeService, resolveCompany, resolveFixedBranch, normalizePhone } from '../normalize-service.js'

/**
 * Internal tool handlers.
 * Each handler receives (params, context) and returns a result string.
 * context = { supabase, userId }
 */

/**
 * Log bot conversation transcript as a lead activity.
 */
async function logBotTranscript(supabase, leadId, userId, sessionId) {
  if (!sessionId) return
  try {
    const { data: msgs } = await supabase
      .from('conversation_messages')
      .select('role, content, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
    if (!msgs?.length) return
    const transcript = msgs.map(m => `${m.role === 'user' ? '👤' : '🤖'} ${m.content}`).join('\n')
    await supabase.from('lead_activities').insert({
      lead_id: leadId, user_id: userId, action: 'bot_transcript',
      metadata: { session_id: sessionId, message_count: msgs.length, transcript },
      actor: 'chatbot',
    })
  } catch (e) {
    console.error('[lead-activity/transcript]', e.message)
  }
}

/**
 * save_lead — UPSERT a lead by phone number (enrich if exists, create if new).
 */
export async function saveLead(params, { supabase, userId, sessionId }) {
  const body = params?.body || params || {}

  const name = body.name
  const phone = normalizePhone(body.phone)
  if (!name || !phone) {
    return JSON.stringify({ success: false, error: 'name and phone are required' })
  }

  // Reject phone string accidentally placed in name (LLM sometimes does this
  // when it skipped asking for the actual name).
  if (normalizePhone(name) === phone || /^\+?\d{6,}$/.test(String(name).trim())) {
    return JSON.stringify({ success: false, error: 'name must be the contact\'s actual name, not a phone number — ask the user for their name first' })
  }

  const serviceNorm = normalizeService(body.service_requested)
  const company = body.company || resolveCompany(serviceNorm)

  // Auto-resolve branch: fixed branch (Udi services → אודי) or city→branch index.
  // Use the new branch_id FK so the lead links cleanly to branches.
  let branch = body.branch || resolveFixedBranch(serviceNorm) || null
  let branchId = null
  if (!branch && body.city && company === 'babait') {
    const { data: idx } = await supabase
      .from('city_branch_index')
      .select('branch_id, branches(name)')
      .eq('user_id', userId)
      .eq('city', body.city)
      .limit(1)
    if (idx?.length) {
      branchId = idx[0].branch_id
      branch = idx[0].branches?.name || branch
    }
  } else if (branch) {
    // If branch was supplied as text, resolve to id for FK linkage
    const { data: br } = await supabase
      .from('branches')
      .select('id')
      .eq('user_id', userId)
      .eq('name', branch)
      .maybeSingle()
    if (br?.id) branchId = br.id
  }

  // Check if lead already exists by phone + user_id
  const { data: existing } = await supabase
    .from('leads')
    .select('*')
    .eq('user_id', userId)
    .eq('phone', phone)
    .order('created_at', { ascending: false })
    .limit(1)

  if (existing?.length) {
    // Enrich existing lead — only update fields that are newly provided and currently empty
    const lead = existing[0]
    const updates = { updated_at: new Date().toISOString() }
    if (name && !lead.name) updates.name = name
    if (body.email) updates.email = body.email
    if (body.city && !lead.city) updates.city = body.city
    if (branch && !lead.branch) updates.branch = branch
    if (branchId && !lead.branch_id) updates.branch_id = branchId
    if (body.service_requested && !lead.service_requested) updates.service_requested = normalizeService(body.service_requested)
    if (body.service_type && !lead.service_type) updates.service_type = body.service_type
    if (body.details) updates.details = lead.details ? `${lead.details}\n---\n${body.details}` : body.details

    // Append to history
    const history = lead.metadata?.history || []
    history.push({
      date: new Date().toISOString(),
      name,
      source: body.source || 'chatbot',
      lead_channel: body.lead_channel || 'whatsapp',
      service_requested: serviceNorm,
      details: body.details || null,
      campaign: body.campaign || null,
    })
    updates.metadata = { ...(lead.metadata || {}), history }

    const { data, error } = await supabase
      .from('leads')
      .update(updates)
      .eq('id', lead.id)
      .select('id, name, phone, city, branch, status')
      .single()

    if (error) {
      console.error('[internal-tools/save_lead]', error.message)
      return JSON.stringify({ success: false, error: error.message })
    }
    // Log enrichment activity
    await supabase.from('lead_activities').insert({
      lead_id: data.id, user_id: userId, action: 'enriched',
      metadata: { source: body.source || 'chatbot', lead_channel: body.lead_channel || 'whatsapp', service_requested: serviceNorm },
      actor: 'chatbot',
    }).then(() => {}).catch(e => console.error('[lead-activity]', e.message))

    // Log bot conversation transcript
    logBotTranscript(supabase, data.id, userId, sessionId)

    return JSON.stringify({ success: true, lead_id: data.id, updated: true, message: `Lead enriched: ${data.name} (${data.phone})` })
  }

  // Create new lead
  const insert = {
    user_id: userId,
    company,
    type: body.type || 'patient',
    name,
    phone,
    email: body.email || null,
    city: body.city || null,
    branch,
    branch_id: branchId,
    coordinator: body.coordinator || null,
    source: body.source || 'chatbot',
    lead_channel: body.lead_channel || 'whatsapp',
    service_requested: serviceNorm,
    service_type: body.service_type || null,
    details: body.details || null,
    status: 'new',
    position_type: body.position_type || null,
    experience: body.experience ?? null,
    campaign: body.campaign || null,
    custom_fields: body.custom_fields || {},
  }

  const { data, error } = await supabase
    .from('leads')
    .insert(insert)
    .select('id, name, phone, city, branch, status')
    .single()

  if (error) {
    console.error('[internal-tools/save_lead]', error.message)
    return JSON.stringify({ success: false, error: error.message })
  }

  // Log creation activity
  await supabase.from('lead_activities').insert({
    lead_id: data.id, user_id: userId, action: 'created',
    metadata: { source: body.source || 'chatbot', lead_channel: body.lead_channel || 'whatsapp' },
    actor: 'chatbot',
  }).then(() => {}).catch(e => console.error('[lead-activity]', e.message))

  // Log bot conversation transcript
  logBotTranscript(supabase, data.id, userId, sessionId)

  return JSON.stringify({ success: true, lead_id: data.id, message: `Lead saved: ${data.name} (${data.phone})` })
}

/**
 * list_branches — List all active branches for the user, each with the
 * cities it serves (joined via city_branch_index FK). Lets the AI answer
 * "do you have a branch in <city>" without separate lookups.
 */
async function listBranches(params, { supabase, userId }) {
  const { data, error } = await supabase
    .from('branches')
    .select('id, name, address, phone, mobile, contact_name, city_branch_index(city)')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('name')

  if (error) {
    console.error('[internal-tools/list_branches]', error.message)
    return JSON.stringify({ success: false, error: error.message })
  }

  if (!data || data.length === 0) {
    return JSON.stringify({ success: true, branches: [], message: 'No branches found' })
  }

  const branches = data.map(b => ({
    name: b.name,
    address: b.address || null,
    phone: b.phone || b.mobile || null,
    contact: b.contact_name || null,
    cities: (b.city_branch_index || []).map(c => c.city).sort(),
  }))

  return JSON.stringify({ success: true, branches, count: branches.length })
}

// --- Handler registry ---

const HANDLERS = {
  save_lead: saveLead,
  list_branches: listBranches,
}

/**
 * Execute an internal tool handler.
 * @param {string} handler - Handler name (e.g., 'save_lead')
 * @param {Object} params - Parameters generated by the LLM
 * @param {Object} context - { supabase, userId }
 * @returns {Promise<string>} Result string
 */
export async function executeInternalTool(handler, params, context) {
  const fn = HANDLERS[handler]
  if (!fn) {
    return `Internal tool error: unknown handler "${handler}"`
  }

  try {
    return await fn(params, context)
  } catch (err) {
    console.error(`[internal-tools/${handler}]`, err.message)
    return `Internal tool error: ${err.message}`
  }
}
