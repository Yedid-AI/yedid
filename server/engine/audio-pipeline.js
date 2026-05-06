/**
 * Audio Pipeline — for answered calls (>= 60s) where no lead was created
 * within a short window, fetch the recording, transcribe with Whisper, and
 * run an LLM analysis to extract lead info. Creates or enriches a lead so
 * conversations the coordinator forgot to log don't fall through the cracks.
 *
 * Runs as a step inside the followup-cron cycle (every minute). Each candidate
 * call is processed at most once — `calls.audio_processed_at` is the idempotency
 * marker, set whether or not the analysis produced a lead.
 */
import { getRecordingUrl } from '../maskyoo.js'
import { transcribeAudio } from './voice.js'
import { createCompletion } from './llm.js'
import { getSetting } from '../settings.js'
import { normalizePhone } from '../normalize-service.js'

// Per-cycle limit. STT + LLM is ~15s per call; the cron runs every minute, so
// keep this small enough to leave headroom for the rest of the followup cycle.
const MAX_PER_CYCLE = 3

// Minimum age (since start_call) before we touch a call. Gives the human
// coordinator time to log the lead manually before the pipeline takes over.
function audioPipelineDelayMinutes() {
  return parseInt(getSetting('AUDIO_PIPELINE_DELAY_MINUTES')) || 10
}

// Lookback window so a call that was missed by the previous cycle still gets
// picked up. 24h is plenty — older recordings often expire on the Maskyoo side.
const LOOKBACK_HOURS = 24

function llmConfig() {
  return {
    provider: getSetting('AUDIO_PIPELINE_LLM_PROVIDER') || 'openai',
    model: getSetting('AUDIO_PIPELINE_LLM_MODEL') || 'gpt-4.1-mini',
  }
}

const SYSTEM_PROMPT = `Tu es un assistant qui analyse des transcripts d'appels téléphoniques en hébreu reçus par une centrale d'aide aux personnes âgées et à leurs familles (services de soins à domicile, employés étrangers, garde à l'hôpital, etc.).

Tu reçois un transcript brut (Whisper, donc parfois bruité) et tu dois extraire les informations utiles pour créer un lead dans le CRM.

Réponds UNIQUEMENT avec un JSON valide, sans markdown ni commentaire, au format exact suivant:
{
  "is_relevant": boolean,
  "name": string|null,
  "city": string|null,
  "service_requested": string|null,
  "summary": string,
  "confidence": "low"|"medium"|"high"
}

Règles:
- "is_relevant" = true uniquement si c'est un vrai prospect intéressé par un service. false pour: démarchage, mauvais numéro, test, appel raccroché immédiatement, message vocal sans contenu utile, conversation hors sujet.
- "name" = nom du contact uniquement s'il est clairement énoncé. Null sinon (ne devine pas).
- "city" = ville uniquement si clairement énoncée. Null sinon.
- "service_requested" = en quelques mots en hébreu, le service demandé (ex: "עובד זר", "מטפלת פרטית", "השגחה בבית חולים", "ליווי לקשיש"). Null si pas clair.
- "summary" = 1-2 phrases en hébreu résumant ce que le prospect veut.
- "confidence" = "low" si transcript trop bruité ou court, "high" si infos claires.`

/**
 * Main entry called every minute from the followup-cron cycle.
 * Iterates active followup configs to know which calls map to which tenant.
 */
export async function processAudioPipeline(supabase) {
  const { data: configs, error: cfgErr } = await supabase
    .from('followup_config')
    .select('*')
    .eq('is_active', true)

  if (cfgErr || !configs?.length) return

  let processedCount = 0

  for (const config of configs) {
    if (processedCount >= MAX_PER_CYCLE) break

    // Resolve source filters (same shape as the followup enqueue path)
    let sourceFilters = []
    if (config.org_id) {
      const { data: orgLines } = await supabase
        .from('maskyoo_lines')
        .select('user_name, cdr_ddi')
        .eq('org_id', config.org_id)
      sourceFilters = orgLines || []
    } else if (config.sources?.length) {
      sourceFilters = config.sources
    }
    if (!sourceFilters.length) continue

    const delayMin = audioPipelineDelayMinutes()
    const upper = new Date(Date.now() - delayMin * 60 * 1000).toISOString()
    const lower = new Date(Date.now() - LOOKBACK_HOURS * 3600 * 1000).toISOString()

    // Candidates: long-answered, old enough that the human had a chance to log
    // the lead, not yet processed by this pipeline.
    const { data: candidates } = await supabase
      .from('calls')
      .select('id, cdr_uniqueid, cdr_ani, cdr_ddi, user_name, start_call, call_duration')
      .gte('start_call', lower)
      .lte('start_call', upper)
      .gte('call_duration', 60)
      .is('audio_processed_at', null)
      .order('start_call', { ascending: false })
      .limit(50)

    if (!candidates?.length) continue

    const matching = candidates.filter(call => sourceFilters.some(src =>
      src.user_name === call.user_name && src.cdr_ddi === call.cdr_ddi,
    ))
    if (!matching.length) continue

    // Skip phones that already have a lead recently — coordinator did log it.
    const phones = [...new Set(matching.map(c => normalizePhone(c.cdr_ani)).filter(Boolean))]
    const recentLeadCutoff = new Date(Date.now() - LOOKBACK_HOURS * 3600 * 1000).toISOString()
    const { data: recentLeads } = phones.length ? await supabase
      .from('leads')
      .select('phone')
      .eq('user_id', config.user_id)
      .in('phone', phones)
      .gte('updated_at', recentLeadCutoff) : { data: [] }
    const skipPhones = new Set((recentLeads || []).map(l => l.phone))

    for (const call of matching) {
      if (processedCount >= MAX_PER_CYCLE) break
      const phone = normalizePhone(call.cdr_ani)
      if (!phone || skipPhones.has(phone)) {
        await markProcessed(supabase, call.id, null, { skipped: 'lead_exists_recent' })
        continue
      }

      try {
        await processSingleCall(supabase, call, phone, config)
      } catch (err) {
        console.error(`[Audio Pipeline] Call ${call.id} failed:`, err.message)
        // Mark as processed with the error so we don't retry the same broken
        // recording every minute. Operator can clear audio_processed_at to retry.
        await markProcessed(supabase, call.id, null, { error: err.message })
      }
      processedCount++
    }
  }

  if (processedCount > 0) {
    console.log(`[Audio Pipeline] Processed ${processedCount} call(s) this cycle`)
  }
}

async function processSingleCall(supabase, call, phone, config) {
  if (!call.cdr_uniqueid) throw new Error('missing cdr_uniqueid')

  // 1. Fetch recording (auth'd Bearer)
  const { url, token } = getRecordingUrl(call.cdr_uniqueid, 'mp3')
  const { transcription } = await transcribeAudio(url, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!transcription || transcription.trim().length < 10) {
    await markProcessed(supabase, call.id, transcription || '', { skipped: 'transcript_too_short' })
    return
  }

  // 2. LLM analysis
  const { provider, model } = llmConfig()
  const userMessage = `Branche: ${call.user_name || 'inconnue'}
Numéro Maskyoo: ${call.cdr_ddi || 'inconnu'}
Téléphone du prospect: ${phone}
Durée: ${call.call_duration}s

Transcript:
${transcription}`

  const { content } = await createCompletion({
    provider,
    model,
    systemPrompt: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
    responseFormat: { type: 'json_object' },
  })

  let analysis
  try {
    analysis = JSON.parse(stripJsonFence(content))
  } catch (err) {
    throw new Error(`LLM returned invalid JSON: ${err.message}`)
  }

  // 3. Create or update lead if relevant
  let leadId = null
  if (analysis.is_relevant) {
    leadId = await upsertLeadFromAnalysis(supabase, {
      userId: config.user_id,
      orgId: config.org_id || null,
      phone,
      callId: call.id,
      analysis,
      transcript: transcription,
      sourceUserName: call.user_name,
    })
  }

  await markProcessed(supabase, call.id, transcription, { ...analysis, lead_id: leadId })
}

function stripJsonFence(text) {
  // The LLM occasionally wraps JSON in ```json fences despite instructions.
  return text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
}

async function upsertLeadFromAnalysis(supabase, { userId, orgId, phone, callId, analysis, transcript, sourceUserName }) {
  const { data: existing } = await supabase
    .from('leads')
    .select('id, name, city, service_requested, details, metadata')
    .eq('user_id', userId)
    .eq('phone', phone)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const detailsLine = analysis.summary ? analysis.summary : null
  const audioMeta = {
    audio_pipeline: {
      processed_at: new Date().toISOString(),
      call_id: callId,
      confidence: analysis.confidence || null,
      source_branch: sourceUserName || null,
    },
  }

  if (existing) {
    // Enrich empty fields only — don't overwrite human-entered data.
    const updates = { updated_at: new Date().toISOString() }
    if (analysis.name && !existing.name) updates.name = analysis.name
    if (analysis.city && !existing.city) updates.city = analysis.city
    if (analysis.service_requested && !existing.service_requested) updates.service_requested = analysis.service_requested

    // Append summary to details rather than overwriting (existing details may
    // be human notes).
    if (detailsLine) {
      const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ')
      const tag = `[${stamp} appel transcrit]`
      updates.details = existing.details
        ? `${existing.details}\n\n${tag} ${detailsLine}`
        : `${tag} ${detailsLine}`
    }

    const history = existing.metadata?.history || []
    history.push({
      date: new Date().toISOString(),
      kind: 'audio_pipeline',
      summary: analysis.summary,
      transcript_excerpt: transcript.slice(0, 500),
    })
    updates.metadata = { ...(existing.metadata || {}), ...audioMeta, history }

    const { error } = await supabase.from('leads').update(updates).eq('id', existing.id)
    if (error) throw new Error(`lead update failed: ${error.message}`)

    await logActivity(supabase, existing.id, userId, 'enriched_from_audio', { call_id: callId, summary: analysis.summary })
    return existing.id
  }

  // New lead — name is NOT NULL on the leads table, so use the LLM name or
  // an empty string fallback (UI renders '—').
  const insert = {
    user_id: userId,
    name: analysis.name || '',
    phone,
    city: analysis.city || null,
    service_requested: analysis.service_requested || null,
    details: detailsLine ? `[appel transcrit] ${detailsLine}` : null,
    source: 'audio_pipeline',
    lead_channel: 'phone',
    status: 'new',
    metadata: { ...audioMeta, history: [{
      date: new Date().toISOString(),
      kind: 'audio_pipeline_create',
      summary: analysis.summary,
      transcript_excerpt: transcript.slice(0, 500),
    }] },
  }

  const { data, error } = await supabase
    .from('leads')
    .insert(insert)
    .select('id')
    .single()
  if (error) throw new Error(`lead insert failed: ${error.message}`)

  await logActivity(supabase, data.id, userId, 'created_from_audio', { call_id: callId, summary: analysis.summary })
  return data.id
}

async function logActivity(supabase, leadId, userId, action, metadata) {
  try {
    await supabase.from('lead_activities').insert({
      lead_id: leadId,
      user_id: userId,
      action,
      metadata,
      actor: 'audio_pipeline',
    })
  } catch (err) {
    // Activity log is best-effort — don't fail the pipeline.
    console.warn('[Audio Pipeline] activity log failed:', err.message)
  }
}

async function markProcessed(supabase, callId, transcript, analysis) {
  await supabase
    .from('calls')
    .update({
      audio_processed_at: new Date().toISOString(),
      transcript: transcript || null,
      transcript_analysis: analysis || null,
    })
    .eq('id', callId)
}
