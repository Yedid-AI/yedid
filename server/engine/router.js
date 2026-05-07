import { createCompletion } from './llm.js'

/**
 * Routing Agent — decides if a message should go to a playbook (scenario) or escalation.
 *
 * @param {Object} opts
 * @param {Object} opts.agentConfig - agent_config row (with llm_provider, llm_model)
 * @param {Array} opts.playbooks - Active playbooks
 * @param {Array} opts.escalationRules - Active escalation rules
 * @param {string} opts.userMessage - Incoming user message
 * @param {Array} opts.conversationHistory - Previous messages [{role, content}]
 * @param {string|null} [opts.lastPlaybookId] - ID of the playbook used in the last exchange
 * @returns {Promise<{type: 'scenario'|'escalation', id: string}>}
 */
export async function routeMessage({ agentConfig, playbooks, escalationRules, userMessage, conversationHistory, lastPlaybookId }) {
  // Format playbooks text
  let playbooksText = ''
  for (const pb of playbooks) {
    const isCurrent = lastPlaybookId && String(pb.id) === String(lastPlaybookId)
    playbooksText += `ID: ${pb.id}${isCurrent ? ' (CURRENTLY ACTIVE)' : ''}\n`
    playbooksText += `Title: ${pb.title}\n`
    playbooksText += `Audience: ${pb.audience || 'N/A'}\n`
    playbooksText += `Rules: ${pb.rules || 'N/A'}\n`
    playbooksText += `---\n`
  }

  // Format escalation rules text
  let escalationRulesText = ''
  for (const er of escalationRules) {
    escalationRulesText += `ID: ${er.id}\n`
    escalationRulesText += `Title: ${er.title}\n`
    escalationRulesText += `Audience: ${er.audience || 'N/A'}\n`
    escalationRulesText += `Trigger: ${er.trigger_description || 'N/A'}\n`
    escalationRulesText += `Rules: ${er.rules || 'N/A'}\n`
    escalationRulesText += `---\n`
  }

  // Build context hint for active playbook
  const activeHint = lastPlaybookId
    ? `\nCURRENT CONTEXT: The conversation was previously handled by playbook ID ${lastPlaybookId}. Only continue with it if the user's NEW message is still relevant to that playbook's topic. If the user changes subject, route to the appropriate playbook.\n`
    : ''

  const systemPrompt = `You are the Routing Agent.

Your task is to analyze the user's message WITH CONVERSATION CONTEXT and classify it into one of two categories:

1. Scenario - a playbook handles the request (THIS IS THE DEFAULT)
2. Escalation - ONLY when an escalation rule's trigger is CLEARLY and EXPLICITLY met

You must ALWAYS return a JSON object with the following structure:
{ "type": "escalation" | "scenario", "id": "<id>" }

CRITICAL ROUTING PRINCIPLE — STRONG BIAS TOWARD SCENARIO:
- A normal service request, lead inquiry, information question, or branch lookup is NEVER an escalation — it goes to the matching playbook.
- Escalation is reserved for situations a playbook genuinely cannot handle: explicit request for a human, repeated frustration after the bot already failed, clear anger at the bot.
- A first-time inquiry (even a complex or sensitive one) is a SCENARIO. The lead/info/branch playbooks exist precisely to handle these.
- When in doubt, ALWAYS choose scenario. Escalation must be the exception, not the default.
- Read each escalation rule's trigger as a strict filter: only escalate if the user's BEHAVIOR in this conversation matches it unambiguously. Do not infer frustration from topic, urgency, or sensitivity alone.

RULES:
- Use CONVERSATION HISTORY to understand context (e.g. if user says "oui" or gives an email, check what was asked before)
- Default to scenario. Only escalate if an escalation rule's trigger is unambiguously satisfied by what the user actually said or did (not by the topic of the request)
- If multiple playbooks match, choose the MOST specific one for the user's CURRENT message
- If the user is continuing the SAME topic as the active playbook, keep routing to that playbook
- If the user changes topic or asks about something different, route to the playbook that best matches the NEW topic — do NOT stick to the previous playbook
- NEVER return multiple items
- NEVER return null
- NEVER omit "id"
- Return ONLY the JSON object, no text before or after, no markdown formatting
${activeHint}
PLAYBOOKS:
${playbooksText}

ESCALATION RULES:
${escalationRulesText}`

  // Build messages (conversation history + current message)
  const messages = [
    ...conversationHistory,
    { role: 'user', content: userMessage },
  ]

  const provider = agentConfig.llm_provider || 'openai'
  const model = agentConfig.llm_model || 'gpt-4.1-mini'

  const result = await createCompletion({
    provider,
    model,
    systemPrompt,
    messages,
    responseFormat: { type: 'json_object' },
  })

  // Robust JSON extraction (handles markdown code blocks, preamble text, etc.)
  const parsed = extractJSON(result.content)

  if (parsed && parsed.type && parsed.id) {
    // Validate that the returned id actually exists
    const validIds = [
      ...playbooks.map(pb => String(pb.id)),
      ...escalationRules.map(er => String(er.id)),
    ]
    const routeId = String(parsed.id)

    if (validIds.includes(routeId)) {
      console.log(`[Router] Decision: ${parsed.type} → ${routeId}`)
      return { type: parsed.type, id: routeId }
    }
    console.warn(`[Router] LLM returned unknown id: ${routeId}. Valid ids: ${validIds.join(', ')}`)
  } else {
    console.warn(`[Router] Failed to extract valid JSON from LLM response. Raw: ${result.content}`)
  }

  // Fallback: prefer last active playbook over arbitrary first
  if (lastPlaybookId && playbooks.some(pb => String(pb.id) === String(lastPlaybookId))) {
    console.warn(`[Router] Fallback → continuing with last active playbook ${lastPlaybookId}`)
    return { type: 'scenario', id: String(lastPlaybookId) }
  }
  if (playbooks.length > 0) {
    console.warn(`[Router] Fallback → first playbook ${playbooks[0].id}`)
    return { type: 'scenario', id: String(playbooks[0].id) }
  }
  throw new Error('Routing failed: no valid playbooks and LLM response unparseable')
}

/**
 * Extract a JSON object from LLM output that may contain markdown fences or surrounding text.
 */
function extractJSON(raw) {
  if (!raw || typeof raw !== 'string') return null

  // Try direct parse first
  try {
    return JSON.parse(raw.trim())
  } catch { /* continue */ }

  // Strip markdown code fences (```json ... ``` or ``` ... ```)
  const fenceMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/)
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim())
    } catch { /* continue */ }
  }

  // Extract first JSON object from text
  const jsonMatch = raw.match(/\{[\s\S]*?\}/)
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0])
    } catch { /* continue */ }
  }

  return null
}
