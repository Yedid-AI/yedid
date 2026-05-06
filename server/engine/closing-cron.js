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
import { queueContextualSecondAttempt } from './followup-cron.js'
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

// Used when a session ended mid-conversation without enough info to create a lead.
// We craft a single short non-pushy WhatsApp message that picks up where the chat
// left off, in the user's apparent language. No JSON — the model returns the bare
// message string ready to send.
const CONTEXTUAL_RELANCE_PROMPT = `אתה כותב הודעת WhatsApp קצרה לרלאנס, בעברית, עבור הלקוח של בבית.
השיחה התחילה אבל הלקוח עזב באמצע לפני שהשארנו פרטים. כתב הודעה אחת:
- חמה אבל לא לחוצה
- מתחברת לנושא ששוחחו עליו
- מציעה להמשיך בלי להתחייב
- עם opt-out רך ("אם זה לא רלוונטי, אפשר פשוט להגיד")
- 2-3 משפטים מקסימום, בלי אמוג'י סטנדרטי, בלי רשימות
החזר רק את גוף ההודעה. בלי "Re:", בלי "תשובה:", בלי הקדמות.`

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

      // 5. Parse response. If the LLM returns malformed JSON, we don't leave the session
      // open forever — fall back to a conservative "not resolved, low confidence" close
      // so the session is removed from the open queue and someone (or the next cron) can revisit.
      let analysis
      try {
        analysis = JSON.parse(result.content)
      } catch {
        console.error(`[Closing] LLM returned invalid JSON for session ${session.id} — closing as unresolved fallback. Raw:`, result.content?.slice(0, 200))
        analysis = { resolved: false, confidence: 0, reason: 'Auto-closed (LLM parse error)' }
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

  // Native chat_conversations: marquer 'resolved' celles inactives depuis N
  // heures. Sans ca, /chat accumule indefiniment des conversations open vides
  // (5 cas observes en 7j de prod). Le trigger on_chat_new_message rouvre
  // automatiquement si le contact reecrit, donc resolve est non-destructif.
  await resolveStaleChatConversations(supabase)
}

async function resolveStaleChatConversations(supabase) {
  const hoursStr = getSetting('NATIVE_CHAT_RESOLVE_HOURS')
  const hours = parseInt(hoursStr) || 72
  if (hours <= 0) return // 0/negatif desactive le cleanup

  const cutoff = new Date(Date.now() - hours * 3600 * 1000).toISOString()

  // On utilise last_message_at; pour les conversations sans aucun message
  // (created mais jamais ecrite), on tombe sur created_at via le OR ci-dessous.
  // Limite a 200 par cycle pour ne pas ecraser un backlog en un coup.
  const { data: stale, error } = await supabase
    .from('chat_conversations')
    .select('id, last_message_at, created_at')
    .in('status', ['open', 'pending'])
    .or(`last_message_at.lt.${cutoff},and(last_message_at.is.null,created_at.lt.${cutoff})`)
    .limit(200)
  if (error) {
    console.error('[Closing/Native] Stale query error:', error.message)
    return
  }
  if (!stale?.length) return

  const ids = stale.map(c => c.id)
  const { error: updErr } = await supabase
    .from('chat_conversations')
    .update({
      status: 'resolved',
      resolved_at: new Date().toISOString(),
    })
    .in('id', ids)
  if (updErr) {
    console.error('[Closing/Native] Stale update error:', updErr.message)
    return
  }
  console.log(`[Closing/Native] Resolved ${ids.length} stale conversations (>${hours}h inactives)`)
}

/**
 * Decide what to do with an abandoned session at close time:
 *   - chatbot already saved a lead during the session → skip
 *   - we have at least a real name + phone → create the lead via lenient save
 *   - we only have a phone, no name → queue a contextualized 2nd relance
 *   - no phone → nothing we can do
 */
async function ensureLeadExists(supabase, session, messages, llmConfig) {
  const phone = session.contact_phone
  if (!phone) return

  const normalizedPhone = normalizePhone(phone)
  if (!normalizedPhone) return

  // Skip if chatbot already saved/enriched a lead for this phone during the session.
  const { data: existingLead } = await supabase
    .from('leads')
    .select('id, name')
    .eq('phone', normalizedPhone)
    .gte('updated_at', session.created_at)
    .limit(1)
  if (existingLead?.length) {
    console.log(`[Closing] Lead already exists for ${normalizedPhone} (session ${session.id})`)
    return
  }

  // Extract whatever we can from the conversation.
  let extracted = {}
  try {
    const extractResult = await createCompletion({
      provider: llmConfig.provider,
      model: llmConfig.model,
      systemPrompt: LEAD_EXTRACTION_PROMPT,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      responseFormat: { type: 'json_object' },
    })
    try { extracted = JSON.parse(extractResult.content) }
    catch { console.error(`[Closing] Extraction JSON parse failed for session ${session.id}`) }
  } catch (err) {
    console.error(`[Closing] Extraction call failed for session ${session.id}:`, err.message)
  }

  // We treat a name as real only if it's not the phone itself or another digit blob.
  const candidateName = extracted.name || session.contact_name || ''
  const looksLikePhone = /^\+?\d{6,}$/.test(candidateName.trim())
  const hasRealName = candidateName.trim().length > 1 && !looksLikePhone

  if (hasRealName) {
    // Path A — create the lead via lenient closing_cron save (no city/service required).
    const leadParams = {
      name: candidateName.trim(),
      phone: normalizedPhone,
      source: 'closing_cron',
      lead_channel: 'whatsapp',
      service_requested: extracted.service_requested || null,
      city: extracted.city || null,
      details: extracted.details || null,
    }
    try {
      const result = await saveLead(leadParams, { supabase, userId: session.user_id, sessionId: session.id })
      const parsed = JSON.parse(result)
      if (parsed.success && parsed.lead_id) {
        await supabase
          .from('lead_activities')
          .update({ actor: 'closing_cron' })
          .eq('lead_id', parsed.lead_id)
          .eq('actor', 'chatbot')
          .gte('created_at', new Date(Date.now() - 5000).toISOString())
        console.log(`[Closing] Rescue lead ${parsed.updated ? 'enriched' : 'created'} for session ${session.id} (${normalizedPhone})`)
      } else {
        console.warn(`[Closing] saveLead failed for session ${session.id}:`, parsed.error)
      }
    } catch (err) {
      console.error(`[Closing] saveLead threw for session ${session.id}:`, err.message)
    }
    return
  }

  // Path B — not enough for a lead. Queue a contextualized 2nd relance instead.
  // We do this only if the user actually engaged (≥1 user message) — otherwise
  // they ignored the 1st relance and the followup-cron's own 24h rescheduler
  // will handle it generically.
  const userMsgCount = messages.filter(m => m.role === 'user').length
  if (userMsgCount === 0) return

  let contextMessage = null
  try {
    const r = await createCompletion({
      provider: llmConfig.provider,
      model: llmConfig.model,
      systemPrompt: CONTEXTUAL_RELANCE_PROMPT,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    })
    contextMessage = (r.content || '').trim()
  } catch (err) {
    console.error(`[Closing] Contextual relance generation failed:`, err.message)
  }
  if (!contextMessage) return

  // Pull org_id from the originating followup_queue item (if any) so the 2nd
  // attempt is grouped with the same followup_config when processQueue runs.
  let orgId = null
  if (session.chatwoot_conversation_id) {
    const { data: src } = await supabase
      .from('followup_queue')
      .select('org_id, call_id, source_user_name, source_cdr_ddi')
      .eq('chatwoot_conversation_id', session.chatwoot_conversation_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    orgId = src?.org_id || null
  }

  const queuedId = await queueContextualSecondAttempt(supabase, {
    userId: session.user_id,
    orgId,
    phone: normalizedPhone,
    message: contextMessage,
  })
  if (queuedId) {
    console.log(`[Closing] Queued contextualized 2nd relance ${queuedId} for ${normalizedPhone} (session ${session.id})`)
  }
}
