import { createCompletion } from './llm.js'

/**
 * Routing Agent — decides if a message should go to a playbook (scenario) or escalation.
 * Port of the n8n "Routing Agent" node.
 *
 * @param {Object} opts
 * @param {Object} opts.agentConfig - agent_config row (with llm_provider, llm_model)
 * @param {Array} opts.playbooks - Active playbooks
 * @param {Array} opts.escalationRules - Active escalation rules
 * @param {string} opts.userMessage - Incoming user message
 * @param {Array} opts.conversationHistory - Previous messages [{role, content}]
 * @returns {Promise<{type: 'scenario'|'escalation', id: string}>}
 */
export async function routeMessage({ agentConfig, playbooks, escalationRules, userMessage, conversationHistory }) {
  // Format playbooks text (same as n8n Prepare Data node)
  let playbooksText = ''
  for (const pb of playbooks) {
    playbooksText += `ID: ${pb.id}\n`
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

  // System prompt — ported verbatim from n8n workflow
  const systemPrompt = `You are the Routing Agent.

Your task is to analyze the user's message WITH CONVERSATION CONTEXT and classify it into one of two categories:

1. Escalation - if ANY escalation rule matches
2. Scenario - if an existing playbook is appropriate

You must ALWAYS return a JSON object with the following structure:
{ "type": "escalation" | "scenario", "id": "<id>" }

RULES:
- Use CONVERSATION HISTORY to understand context (e.g. if user says "oui" or gives an email, check what was asked before)
- If ANY escalation rule matches the user message, return "type": "escalation" with the matching rule id
- If NO escalation rule matches, select the MOST relevant playbook and return "type": "scenario" with id
- If multiple playbooks match, choose the MOST specific
- If conversation is in progress with a playbook, CONTINUE with that same playbook unless escalation is triggered
- NEVER return multiple items
- NEVER return null
- NEVER omit "id"
- NEVER output text outside JSON
- NEVER explain your reasoning

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

  // Parse the JSON response
  try {
    const parsed = JSON.parse(result.content)
    if (!parsed.type || !parsed.id) {
      throw new Error('Missing type or id in routing response')
    }
    return { type: parsed.type, id: String(parsed.id) }
  } catch (err) {
    console.error('Router parse error:', err.message, 'Raw:', result.content)
    // Fallback: if we have playbooks, default to the first one
    if (playbooks.length > 0) {
      return { type: 'scenario', id: String(playbooks[0].id) }
    }
    throw new Error('Routing failed: ' + err.message)
  }
}
