/**
 * Closing Cron — Automatically closes inactive sessions with AI resolution analysis.
 * Replaces the n8n "closing conversation" workflow.
 *
 * Schedule: runs every CLOSING_INTERVAL_MINUTES (default 15).
 * For each open session whose last message is older than CLOSING_INACTIVITY_MINUTES:
 *   1. Load conversation messages
 *   2. Call LLM to determine resolved / confidence / reason
 *   3. Close the session with the AI result
 */

import cron from 'node-cron'
import { getSetting } from '../settings.js'
import { createCompletion } from './llm.js'
import { closeSession } from './session-logger.js'

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
    } catch (err) {
      console.error(`[Closing] Error processing session ${session.id}:`, err.message)
    }
  }

  if (closedCount > 0) {
    console.log(`[Closing] Cycle complete — closed ${closedCount} sessions`)
  }
}
