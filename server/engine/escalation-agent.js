import { createCompletion } from './llm.js'

/**
 * Escalation Agent — generates an empathetic user response + internal summary.
 * Port of the n8n "Escalation Agent" node.
 *
 * @param {Object} opts
 * @param {Object} opts.agentConfig - agent_config row
 * @param {Object} opts.rule - Escalation rule row
 * @param {string} opts.userMessage - Incoming user message
 * @param {Array} opts.conversationHistory - Previous messages [{role, content}]
 * @returns {Promise<{reponse: string, resume: string}>}
 */
export async function runEscalationAgent({ agentConfig, rule, userMessage, conversationHistory }) {
  const provider = agentConfig.llm_provider || 'openai'
  const model = agentConfig.llm_model || 'gpt-4.1-mini'

  // System prompt — ported from n8n Escalation Agent node
  const systemPrompt = `You are the Escalation Agent.

Your purpose is to respond politely to the user while acknowledging the issue and escalating to a human operator.

You must:
- Avoid technical details or speculative fixes
- Avoid committing to deadlines or promises
- Clarify the issue briefly if necessary
- Reassure the user that the team will intervene

Dynamic context:
- Escalation Title: ${rule.title}
- Audience: ${rule.audience || 'N/A'}
- Trigger: ${rule.trigger_description || 'N/A'}
- Rules: ${rule.rules || 'N/A'}

Expected output (STRICT JSON):
{ "reponse": "<message for the user>", "resume": "<summary for the human agent>" }

- reponse: short, empathetic, no technical details
- resume: clear explanation of the problem, context, severity
No markdown, no text outside JSON.`

  const messages = [
    ...conversationHistory,
    { role: 'user', content: userMessage },
  ]

  const result = await createCompletion({
    provider,
    model,
    systemPrompt,
    messages,
    responseFormat: { type: 'json_object' },
  })

  // Parse structured output
  try {
    const parsed = JSON.parse(result.content)
    return {
      reponse: parsed.reponse || parsed.response || '',
      resume: parsed.resume || parsed.summary || '',
    }
  } catch (err) {
    console.error('Escalation parse error:', err.message, 'Raw:', result.content)
    // Fallback: use raw content as response
    return {
      reponse: result.content,
      resume: `Escalation triggered for rule: ${rule.title}. Parse error on agent output.`,
    }
  }
}
