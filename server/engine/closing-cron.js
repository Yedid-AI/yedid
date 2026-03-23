/**
 * Closing Cron — Automatically closes inactive sessions with AI resolution analysis.
 * Replaces the n8n "closing conversation" workflow.
 *
 * Schedule: runs every CLOSING_INTERVAL_MINUTES (default 15).
 * For each open session whose last message is older than CLOSING_INACTIVITY_MINUTES:
 *   1. Load conversation messages
 *   2. Call LLM to determine resolved / confidence / reason
 *   3. Close the session with the AI result
 *   4. If no lead was saved during the session, auto-create/update the lead
 */

import cron from 'node-cron'
import { getSetting } from '../settings.js'
import { createCompletion } from './llm.js'
import { closeSession } from './session-logger.js'
import { saveLead } from './internal-tools.js'
import { normalizePhone } from '../normalize-service.js'

const DEFAULT_CLOSING_PROMPT = `You are Yedid AI Closing Analyzer. Your task is to determine whether a support conversation was resolved by the AI assistant.

RESOLVED RULES

A conversation is resolved if ANY of the following occur:

The user expressed a real business or technical need and the agent addressed it:
- optimization, improvement, integration, troubleshooting
- product questions, workflow questions, performance issues

The agent provided meaningful value:
- diagnostic steps, analysis, recommendations
- business explanations, solution-oriented guidance
- initial guidance, strategic orientation, actionable next steps

The user stopped responding after the agent started a value-adding process.
(If the agent began creating value and the user stopped responding, the session is classified as resolved.)

NOT RESOLVED RULES

A conversation is not resolved only if ALL of the following are true:

The exchange contains only greetings or social chit-chat.
The user message is a test, empty, irrelevant, or unusable.
The agent provides zero value (no analysis, no diagnostic, no recommendations).

CENTRAL PRINCIPLE

If the conversation touches a business or technical topic and the agent engages with even the beginning of a diagnostic or analysis, the session is resolved.

OUTPUT FORMAT (Mandatory)

Return only valid JSON:

{"resolved": true or false, "confidence": 0.0, "reason": "short explanation"}

No introduction. Analyze strictly based on the provided messages. Respond only in JSON.`

const LEAD_EXTRACTION_PROMPT = `Extract contact and lead information from this conversation.
Return ONLY valid JSON with these fields (use null for unknown):

{"name": "contact name or null", "service_requested": "what they need or null", "city": "city or null", "details": "brief summary of the request or null"}

Rules:
- Extract the contact's name if mentioned anywhere in the conversation
- service_requested: the main service or product discussed
- city: only if explicitly mentioned
- details: 1-2 sentence summary of what the contact wanted
- If the conversation is just greetings with no substance, return all nulls
- Respond ONLY in JSON, no introduction.`

let cronTask = null

export function startClosingCron(supabase) {
  if (!supabase) return

  const enabled = getSetting('CLOSING_ENABLED')
  if (enabled !== 'true') {
    console.log('[Closing] Cron disabled')
    return
  }

  const interval = parseInt(getSetting('CLOSING_INTERVAL_MINUTES')) || 15
  const expression = `*/${interval} * * * *`

  cronTask = cron.schedule(expression, () => {
    runClosingCycle(supabase).catch((err) => {
      console.error('[Closing] Cycle error:', err.message)
    })
  })

  console.log(`[Closing] Cron started — every ${interval} minutes`)
}

export function stopClosingCron() {
  if (cronTask) {
    cronTask.stop()
    cronTask = null
    console.log('[Closing] Cron stopped')
  }
}

export function restartClosingCron(supabase) {
  stopClosingCron()
  startClosingCron(supabase)
}

export async function runClosingCycle(supabase) {
  const enabled = getSetting('CLOSING_ENABLED')
  if (enabled !== 'true') return

  const inactivityMinutes = parseInt(getSetting('CLOSING_INACTIVITY_MINUTES')) || 30
  const provider = getSetting('CLOSING_LLM_PROVIDER') || 'openai'
  const model = getSetting('CLOSING_LLM_MODEL') || 'gpt-4.1-mini'
  const closingPrompt = getSetting('CLOSING_BILLING_PROMPT') || DEFAULT_CLOSING_PROMPT

  const cutoff = new Date(Date.now() - inactivityMinutes * 60 * 1000).toISOString()

  // 1. Find all open sessions (include contact info for lead creation)
  const { data: openSessions, error: sessErr } = await supabase
    .from('sessions')
    .select('id, user_id, ai_reason, contact_phone, contact_name, created_at')
    .eq('status', 'open')

  if (sessErr || !openSessions || openSessions.length === 0) return

  console.log(`[Closing] Found ${openSessions.length} open sessions, checking inactivity...`)

  let closedCount = 0

  for (const session of openSessions) {
    try {
      // Skip LLM analysis for preview/test sessions — close directly
      if (session.ai_reason?.startsWith('PREVIEW')) {
        await closeSession(supabase, session.id, session.ai_reason, false, 1.0)
        closedCount++
        console.log(`[Closing] Session ${session.id} → PREVIEW/TEST (skipped analysis)`)
        continue
      }

      // 2. Get the last message timestamp
      const { data: lastMsgs } = await supabase
        .from('conversation_messages')
        .select('created_at')
        .eq('session_id', session.id)
        .order('created_at', { ascending: false })
        .limit(1)

      // Skip sessions with no messages (just created, not yet used)
      if (!lastMsgs || lastMsgs.length === 0) continue

      // Skip if has recent activity (last message is newer than cutoff)
      if (lastMsgs[0].created_at > cutoff) continue

      // 3. Load all messages for closing analysis
      const { data: messages } = await supabase
        .from('conversation_messages')
        .select('role, content')
        .eq('session_id', session.id)
        .order('created_at', { ascending: true })

      if (!messages || messages.length === 0) continue

      // 4. Call LLM for resolution analysis
      const result = await createCompletion({
        provider,
        model,
        systemPrompt: closingPrompt,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        responseFormat: { type: 'json_object' },
      })

      // 5. Parse response
      let analysis
      try {
        analysis = JSON.parse(result.content)
      } catch {
        console.error(`[Closing] Failed to parse LLM response for session ${session.id}:`, result.content)
        continue
      }

      // 6. Close the session (resolved maps to billable field in DB)
      const resolved = analysis.resolved === true || analysis.billable === true
      await closeSession(
        supabase,
        session.id,
        analysis.reason || 'Auto-closed by closing analyzer',
        resolved,
        typeof analysis.confidence === 'number' ? analysis.confidence : null,
      )

      closedCount++
      console.log(`[Closing] Session ${session.id} → resolved: ${resolved}, confidence: ${analysis.confidence}`)

      // 7. Auto-create/update lead if not already saved during session
      await ensureLeadExists(supabase, session, messages, { provider, model })
    } catch (err) {
      console.error(`[Closing] Error processing session ${session.id}:`, err.message)
    }
  }

  if (closedCount > 0) {
    console.log(`[Closing] Cycle complete — closed ${closedCount} sessions`)
  }
}

/**
 * Ensure a lead exists for this session's contact.
 * If the AI agent already called save_lead during the session, skip.
 * Otherwise, extract info from messages and create/update the lead.
 */
async function ensureLeadExists(supabase, session, messages, llmConfig) {
  const phone = session.contact_phone
  if (!phone) return // No phone → can't create lead

  const normalizedPhone = normalizePhone(phone)

  // Check if lead was already saved by chatbot during this session
  const { data: activities } = await supabase
    .from('lead_activities')
    .select('id')
    .eq('user_id', session.user_id)
    .in('actor', ['chatbot'])
    .gte('created_at', session.created_at)
    .limit(1)

  // Need to verify the activity is for the same phone
  if (activities?.length) {
    const { data: existingLead } = await supabase
      .from('leads')
      .select('id')
      .eq('user_id', session.user_id)
      .eq('phone', normalizedPhone)
      .gte('updated_at', session.created_at)
      .limit(1)

    if (existingLead?.length) {
      console.log(`[Closing] Lead already saved for ${normalizedPhone} during session ${session.id}`)
      return
    }
  }

  // Extract lead info from conversation via LLM
  let extracted = {}
  try {
    const extractResult = await createCompletion({
      provider: llmConfig.provider,
      model: llmConfig.model,
      systemPrompt: LEAD_EXTRACTION_PROMPT,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      responseFormat: { type: 'json_object' },
    })
    extracted = JSON.parse(extractResult.content)
  } catch (err) {
    console.error(`[Closing] Lead extraction failed for session ${session.id}:`, err.message)
  }

  // Build lead params — use extracted name, fallback to contact_name, fallback to phone
  const leadParams = {
    name: extracted.name || session.contact_name || normalizedPhone,
    phone: normalizedPhone,
    source: 'closing_cron',
    lead_channel: 'whatsapp',
    service_requested: extracted.service_requested || null,
    city: extracted.city || null,
    details: extracted.details || null,
  }

  try {
    const result = await saveLead(leadParams, { supabase, userId: session.user_id })
    const parsed = JSON.parse(result)

    // Update activity actor to closing_cron (saveLead logs as 'chatbot' by default)
    if (parsed.success && parsed.lead_id) {
      await supabase
        .from('lead_activities')
        .update({ actor: 'closing_cron' })
        .eq('lead_id', parsed.lead_id)
        .eq('actor', 'chatbot')
        .gte('created_at', new Date(Date.now() - 5000).toISOString())

      console.log(`[Closing] Lead ${parsed.updated ? 'enriched' : 'created'}: ${leadParams.name} (${normalizedPhone}) for session ${session.id}`)
    }
  } catch (err) {
    console.error(`[Closing] Lead creation failed for session ${session.id}:`, err.message)
  }
}
