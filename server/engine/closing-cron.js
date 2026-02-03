/**
 * Closing Cron — Automatically closes inactive sessions with AI billing analysis.
 * Replaces the n8n "closing conversation" workflow.
 *
 * Schedule: runs every CLOSING_INTERVAL_MINUTES (default 15).
 * For each open session whose last message is older than CLOSING_INACTIVITY_MINUTES:
 *   1. Load conversation messages
 *   2. Call LLM to determine billable / confidence / reason
 *   3. Close the session with the AI result
 */

import cron from 'node-cron'
import { getSetting } from '../settings.js'
import { createCompletion } from './llm.js'
import { closeSession } from './session-logger.js'

const DEFAULT_BILLING_PROMPT = `You are Cardynal Billing Analyzer. Your task is to determine whether a support conversation is billable or non-billable.

BILLABLE RULES

A conversation is billable if ANY of the following occur:

The user expresses a real business or technical need, such as:
- optimization
- improvement
- integration
- troubleshooting
- product questions
- workflow questions
- performance issues

The agent asks a clarification question as part of a diagnostic or business-oriented analysis.

The agent begins any expert reasoning, including:
- diagnostic steps
- analysis
- recommendations
- business explanations
- solution-oriented questioning

The agent provides any business value, even partially:
- initial guidance
- strategic orientation
- tailored explanation
- actionable next steps

The user leaves the conversation after the agent has started a diagnostic or value-adding process.
→ This is always billable.
(If the agent begins value creation and the user stops responding, the session is classified as billable.)

NON-BILLABLE RULES

A conversation is non-billable only if ALL of the following are true:

The exchange contains only greetings or social chit-chat.

The user message is a test, empty, irrelevant, or unusable.

The agent provides zero value:
- no analysis
- no diagnostic
- no recommendations
- no business explanation

If the agent did not create value and the user did not express any business/technical need, then it is non-billable.

CENTRAL PRINCIPLE

If the conversation touches a business or technical topic, and the agent engages with even the beginning of a diagnostic or analysis, the session is billable.

If the customer stops mid-conversation after the agent begins a diagnostic → billable.

OUTPUT FORMAT (Mandatory)

Return only valid JSON:

{"billable": true or false, "confidence": 0.0, "reason": "short explanation"}

No introduction. Analyze strictly based on the provided messages. Respond only in JSON.`

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
  const billingPrompt = getSetting('CLOSING_BILLING_PROMPT') || DEFAULT_BILLING_PROMPT

  const cutoff = new Date(Date.now() - inactivityMinutes * 60 * 1000).toISOString()

  // 1. Find all open sessions
  const { data: openSessions, error: sessErr } = await supabase
    .from('sessions')
    .select('id, user_id, ai_reason')
    .eq('status', 'open')

  if (sessErr || !openSessions || openSessions.length === 0) return

  console.log(`[Closing] Found ${openSessions.length} open sessions, checking inactivity...`)

  let closedCount = 0

  for (const session of openSessions) {
    try {
      // Skip LLM billing analysis for preview/test sessions — close directly
      if (session.ai_reason?.startsWith('PREVIEW')) {
        await closeSession(supabase, session.id, session.ai_reason, false, 1.0)
        closedCount++
        console.log(`[Closing] Session ${session.id} → PREVIEW/TEST (skipped billing analysis)`)
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

      // 3. Load all messages for billing analysis
      const { data: messages } = await supabase
        .from('conversation_messages')
        .select('role, content')
        .eq('session_id', session.id)
        .order('created_at', { ascending: true })

      if (!messages || messages.length === 0) continue

      // 4. Call LLM for billing analysis
      const result = await createCompletion({
        provider,
        model,
        systemPrompt: billingPrompt,
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

      // 6. Close the session
      await closeSession(
        supabase,
        session.id,
        analysis.reason || 'Auto-closed by billing analyzer',
        analysis.billable === true,
        typeof analysis.confidence === 'number' ? analysis.confidence : null,
      )

      closedCount++
      console.log(`[Closing] Session ${session.id} → billable: ${analysis.billable}, confidence: ${analysis.confidence}`)
    } catch (err) {
      console.error(`[Closing] Error processing session ${session.id}:`, err.message)
    }
  }

  if (closedCount > 0) {
    console.log(`[Closing] Cycle complete — closed ${closedCount} sessions`)
  }
}
