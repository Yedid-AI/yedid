import { createCompletion, buildToolResultMessage, buildAssistantToolCallMessage } from './llm.js'
import { searchKnowledgeBase, formatKBResults, knowledgeBaseToolDef } from './knowledge-base.js'
import { buildToolDef, executeTool } from './tools.js'
import { executeInternalTool } from './internal-tools.js'

const MAX_TOOL_ROUNDS = 5

/**
 * Playbook Agent — executes a playbook with LLM, knowledge base, and optional API tool.
 * Port of the n8n "Playbook Agent" node.
 *
 * @param {Object} opts
 * @param {Object} opts.agentConfig - agent_config row
 * @param {Object} opts.playbook - Active playbook
 * @param {Array} opts.agentTools - All tools available to the agent
 * @param {string} opts.userMessage - Incoming user message
 * @param {Array} opts.conversationHistory - Previous messages [{role, content}]
 * @param {Object} opts.supabase - Supabase client
 * @param {string} opts.userId - User ID for KB filtering
 * @returns {Promise<string>} Agent response text
 */
export async function runPlaybookAgent({ agentConfig, playbook, agentTools = [], userMessage, conversationHistory, supabase, userId, contactContext }) {
  const provider = agentConfig.llm_provider || 'openai'
  const model = agentConfig.llm_model || 'gpt-4.1-mini'

  // Track metadata during tool-use loop
  const metadata = {
    tool_calls: [],
    kb_searches: [],
    tool_rounds: 0,
    token_usage: { input_tokens: 0, output_tokens: 0 },
  }

  // Build system prompt
  const systemPrompt = `# Identity
You are ${agentConfig.name}.

# Global Instructions
${agentConfig.prompt}

Your mission is to respond STRICTLY according to the ACTIVE PLAYBOOK.

You must:
- Follow the playbook's scenario and rules with absolute priority
- Never contradict or go outside the playbook
- Never invent rules or features
- Never mention that you are following a playbook

# Tone: ${agentConfig.tone}
# Response Length: ${agentConfig.response_length}

# Knowledge Base Usage — CRITICAL
- ALWAYS search the knowledge base when the user asks a factual question (prices, levels, conditions, eligibility, processes, etc.)
- When you find relevant information in the KB, give the EXACT answer with specific details (numbers, names, conditions). Do NOT paraphrase vaguely or say "I can send you more info" — just give the info directly.
- If the KB has a clear answer, deliver it in your response. Be precise and helpful.
- If no result is found, say so transparently. Do not invent facts.
- NEVER offer to "send more details later" when you already have the information — just share it now.

# Writing Style — CRITICAL
You are a REAL PERSON chatting on WhatsApp/webchat. You must sound human, not like an AI.
- Write SHORT messages (1-3 sentences max)
- Be warm and casual, like a friendly colleague
- NEVER write bullet points, numbered lists, or structured text
- NEVER write long paragraphs
- Use "..." for pauses, "!" for enthusiasm

# Emojis
- Do NOT put an emoji in every message. A real person uses emojis occasionally, not systematically.
- Use an emoji only when it adds warmth or emotion naturally (excitement, humor, encouragement).
- Many messages should have ZERO emojis. Vary your style.

# Multi-message (--- separator)
When your response contains ---, each part will be sent as a SEPARATE message bubble.
- MOST responses should be a SINGLE message. One message = the default.
- Only split into 2 messages when there's a real reason: a greeting + a question, or an acknowledgment + new info.
- NEVER split systematically. If the answer fits in one short message, send ONE message.
- Never use the same pattern twice in a row.

Examples of GOOD responses:
Single message (most common): "היי! איך אפשר לעזור?"
Single message with info: "יש 6 רמות סיעוד, מ-2.5 שעות שבועיות ברמה 1 ועד 24/7 ברמה 6. רוצה שאפרט על רמה ספציפית?"
Two messages when natural: "הבנתי, עובד זר זה פתרון מעולה\n---\nאתה יכול לספר לי באיזו עיר מדובר?"

Example of BAD response (robotic pattern — NEVER do this):
"שמחה שפנית אלינו 😊\n---\nאיך אפשר לעזור?" ← emoji on first + split = feels like a bot

# ACTIVE PLAYBOOK: ${playbook.title}
- Audience: ${playbook.audience || 'N/A'}
- Scenario: ${playbook.content}
- Rules: ${playbook.rules || 'N/A'}${contactContext?.phone ? `

# Contact Info
- Phone: ${contactContext.phone}${contactContext.name ? `\n- Name: ${contactContext.name}` : ''}${contactContext.source ? `\n- Call Source: ${contactContext.source}` : ''}${contactContext.maskyoo_number ? `\n- Called Number: ${contactContext.maskyoo_number}` : ''}${contactContext.followup ? `\n- Context: This person called and we're following up via WhatsApp` : ''}` : ''}`

  // Build available tools — KB search + all agent tools
  const tools = [knowledgeBaseToolDef]

  // Build a lookup map for all agent tools (by prefixed name)
  const toolMap = new Map()
  for (const t of agentTools) {
    const def = buildToolDef(t)
    tools.push(def)
    toolMap.set(def.name, t)
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

    // Accumulate token usage (normalize OpenAI/Anthropic formats)
    if (result.usage) {
      metadata.token_usage.input_tokens += result.usage.prompt_tokens || result.usage.input_tokens || 0
      metadata.token_usage.output_tokens += result.usage.completion_tokens || result.usage.output_tokens || 0
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
        } else {
          // Lookup tool from the agent's tool map
          const matchedTool = toolMap.get(toolCall.name)
          if (matchedTool?.type === 'internal') {
            toolResult = await executeInternalTool(matchedTool.handler, toolCall.arguments, { supabase, userId })
            metadata.tool_calls.push({ name: matchedTool.name, handler: matchedTool.handler, arguments: toolCall.arguments })
          } else if (matchedTool) {
            toolResult = await executeTool(matchedTool, toolCall.arguments?.body || toolCall.arguments)
            metadata.tool_calls.push({ name: matchedTool.name, arguments: toolCall.arguments })
          } else {
            toolResult = `Unknown tool: ${toolCall.name}`
          }
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
    if (finalResult.usage) {
      metadata.token_usage.input_tokens += finalResult.usage.prompt_tokens || finalResult.usage.input_tokens || 0
      metadata.token_usage.output_tokens += finalResult.usage.completion_tokens || finalResult.usage.output_tokens || 0
    }
    return { content: finalResult.content, metadata }
  } catch (err) {
    console.error('[PlaybookAgent] Final LLM call failed:', err.message)
    return { content: 'Desole, une erreur est survenue. Veuillez reessayer.', metadata }
  }
}
