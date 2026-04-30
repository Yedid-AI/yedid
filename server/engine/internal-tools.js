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
 *
 * The LLM caller (Shira) ignores soft errors and tells the user "lead saved" anyway,
 * which produced ~56% silent failures in production. Errors here are returned in a
 * structured form with an `instruction` field that tells the LLM exactly what to do
 * next so it cannot rationalize past the failure.
 */
export async function saveLead(params, { supabase, userId, sessionId, enterpriseUserId }) {
  const body = params?.body || params || {}

  const fail = (error, instruction, missing) => JSON.stringify({
    success: false, error, instruction, missing_fields: missing || undefined,
    must_not_tell_user_saved: true,
  })

  const rawName = typeof body.name === 'string' ? body.name.trim() : ''
  const phone = normalizePhone(body.phone)

  // Required-field validation matching the published tool schema for chatbot calls.
  // Rescue callers (closing_cron, manual imports) only need name+phone — they're trying
  // to salvage a partial conversation, not collect a clean lead, and refusing to write
  // a phone-only lead means we lose the contact entirely.
  const isStrict = (body.source || 'chatbot') === 'chatbot'
  const missing = []
  if (!rawName) missing.push('name')
  if (!phone) missing.push('phone')
  if (isStrict && (!body.city || !String(body.city).trim())) missing.push('city')
  if (isStrict && (!body.service_requested || !String(body.service_requested).trim())) missing.push('service_requested')
  if (missing.length) {
    return fail(
      `MISSING REQUIRED FIELDS: ${missing.join(', ')}`,
      `DO NOT tell the user the lead is saved. Ask the user for the missing field(s) one at a time, then call save_lead again with all four required fields: name, phone, city, service_requested.`,
      missing,
    )
  }

  // Reject phone string accidentally placed in name (LLM occasionally does this
  // when it skipped asking for the actual name).
  if (normalizePhone(rawName) === phone || /^\+?\d{6,}$/.test(rawName)) {
    return fail(
      'name must be the contact\'s actual name, not a phone number',
      'DO NOT tell the user the lead is saved. Ask the user for their full name (first + last), then call save_lead again.',
    )
  }

  // Reject obvious LLM placeholders for phone — normalizePhone already rejects
  // text-only input, but this catches the few digit-bearing placeholders.
  // Note: after normalize the country code is prepended, so we look at the trailing
  // local-number digits (last 9) for repetition rather than the whole string.
  const phoneDigits = phone.replace(/\D/g, '')
  const localDigits = phoneDigits.slice(-9)
  if (/^(\d)\1+$/.test(localDigits)) {
    return fail(
      'phone looks like a placeholder, not a real number',
      'DO NOT tell the user the lead is saved. Ask the user to confirm their phone number, then call save_lead again.',
    )
  }

  const name = rawName

  const serviceNorm = normalizeService(body.service_requested)
  const company = body.company || resolveCompany(serviceNorm)

  // Auto-resolve branch: fixed branch (Udi services → אודי) or city→branch index.
  // Use the new branch_id FK so the lead links cleanly to branches.
  // Branches and city_branch_index are owned by the enterprise tenant
  // (babait=user_id 2, aviezer=user_id 3), not the inbox owner (admin=1).
  // Fall back to the inbox userId so legacy single-tenant setups still resolve.
  const branchUserId = enterpriseUserId || userId
  let branch = body.branch || resolveFixedBranch(serviceNorm) || null
  let branchId = null
  if (!branch && body.city && company === 'babait') {
    const { data: idx } = await supabase
      .from('city_branch_index')
      .select('branch_id, branches(name)')
      .eq('user_id', branchUserId)
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
      .eq('user_id', branchUserId)
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
      metadata: {
        source: body.source || 'chatbot',
        lead_channel: body.lead_channel || 'whatsapp',
        service_requested: serviceNorm,
        ...(sessionId ? { session_id: sessionId } : {}),
      },
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
    metadata: {
      source: body.source || 'chatbot',
      lead_channel: body.lead_channel || 'whatsapp',
      ...(sessionId ? { session_id: sessionId } : {}),
    },
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
async function listBranches(params, { supabase, userId, enterpriseUserId }) {
  const branchUserId = enterpriseUserId || userId
  const { data, error } = await supabase
    .from('branches')
    .select('id, name, address, phone, mobile, contact_name, city_branch_index(city)')
    .eq('user_id', branchUserId)
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
