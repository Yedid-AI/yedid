import { createCompletion, buildToolResultMessage, buildAssistantToolCallMessage } from './llm.js'
import { searchKnowledgeBase, formatKBResults, knowledgeBaseToolDef } from './knowledge-base.js'
import { buildToolDef, executeTool } from './tools.js'

const MAX_TOOL_ROUNDS = 5

/**
 * Playbook Agent — executes a playbook with LLM, knowledge base, and optional API tool.
 * Port of the n8n "Playbook Agent" node.
 *
 * @param {Object} opts
 * @param {Object} opts.agentConfig - agent_config row
 * @param {Object} opts.playbook - Active playbook (with .tool if associated)
 * @param {string} opts.userMessage - Incoming user message
 * @param {Array} opts.conversationHistory - Previous messages [{role, content}]
 * @param {Object} opts.supabase - Supabase client
 * @param {string} opts.userId - User ID for KB filtering
 * @returns {Promise<string>} Agent response text
 */
export async function runPlaybookAgent({ agentConfig, playbook, userMessage, conversationHistory, supabase, userId }) {
  const provider = agentConfig.llm_provider || 'openai'
  const model = agentConfig.llm_model || 'gpt-4.1-mini'

  // Track metadata during tool-use loop
  const metadata = {
    tool_calls: [],
    kb_searches: [],
    tool_rounds: 0,
  }

  // Build system prompt — ported from n8n Playbook Agent node
  const systemPrompt = `# Identity
You are ${agentConfig.name}.

# Global Instructions
${agentConfig.prompt}

Your mission is to respond STRICTLY according to the ACTIVE PLAYBOOK.

You must:
- Follow the playbook's scenario and rules with absolute priority
- Adapt tone and length according to the agent parameters
- Never contradict or go outside the playbook
- Never invent rules or features
- Never mention that you are following a playbook

# Tone: ${agentConfig.tone}
# Response Length: ${agentConfig.response_length}

# Knowledge Base Usage
Search the knowledge base before saying you don't know. Base answers on retrieved information. If no result, say so transparently. Do not invent facts.

# Playbook Priority
When a playbook is active, it overrides general behavior rules, tone defaults, and normal conversation flows.

# Output Format
Write a natural-sounding assistant response.
Do NOT output JSON.
Do NOT mention system settings, agent parameters, or the existence of playbooks.

# ACTIVE PLAYBOOK: ${playbook.title}
- Audience: ${playbook.audience || 'N/A'}
- Scenario: ${playbook.content}
- Rules: ${playbook.rules || 'N/A'}`

  // Build available tools
  const tools = [knowledgeBaseToolDef]

  // Add dynamic API tool if playbook has one
  const apiTool = playbook.tool || null
  if (apiTool) {
    tools.push(buildToolDef(apiTool))
  }

  // Start conversation
  let messages = [
    ...conversationHistory,
    { role: 'user', content: userMessage },
  ]

  // Tool-use loop
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    let result
    try {
      result = await createCompletion({
        provider,
        model,
        systemPrompt,
        messages,
        tools,
      })
    } catch (err) {
      console.error(`[PlaybookAgent] LLM call failed (round ${round}):`, err.message)
      return { content: 'Desole, une erreur est survenue. Veuillez reessayer.', metadata }
    }

    // No tool calls — we have the final response
    if (!result.toolCalls || result.toolCalls.length === 0) {
      return { content: result.content, metadata }
    }

    metadata.tool_rounds = round + 1

    // Process tool calls
    // First, add the assistant's tool-call message to conversation
    messages.push(buildAssistantToolCallMessage(provider, result.content, result.toolCalls))

    for (const toolCall of result.toolCalls) {
      let toolResult

      try {
        if (toolCall.name === 'search_knowledge_base') {
          // Knowledge base search
          const query = toolCall.arguments?.query || ''
          const kbResults = await searchKnowledgeBase(supabase, query, userId)
          toolResult = formatKBResults(kbResults) || 'No relevant information found in the knowledge base.'
          metadata.kb_searches.push({ query, results_count: kbResults.length })
        } else if (toolCall.name.startsWith('api_tool_') && apiTool) {
          // Dynamic API tool
          toolResult = await executeTool(apiTool, toolCall.arguments?.body || toolCall.arguments)
          metadata.tool_calls.push({ name: apiTool.name, arguments: toolCall.arguments })
        } else {
          toolResult = `Unknown tool: ${toolCall.name}`
        }
      } catch (err) {
        console.error(`[PlaybookAgent] Tool ${toolCall.name} failed:`, err.message)
        toolResult = `Tool error: ${err.message}`
      }

      messages.push(buildToolResultMessage(provider, toolCall.id, toolCall.name, toolResult))
    }
  }

  // If we exhausted rounds, do one final call without tools
  try {
    const finalResult = await createCompletion({
      provider,
      model,
      systemPrompt,
      messages,
    })
    return { content: finalResult.content, metadata }
  } catch (err) {
    console.error('[PlaybookAgent] Final LLM call failed:', err.message)
    return { content: 'Desole, une erreur est survenue. Veuillez reessayer.', metadata }
  }
}
