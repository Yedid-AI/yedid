import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import { getSetting } from '../settings.js'

// --- Provider instances (lazy) ---

let openaiInstance = null
let anthropicInstance = null

function getOpenAIClient() {
  const key = getSetting('OPENAI_API_KEY')
  if (!key) throw new Error('OPENAI_API_KEY non configure. Ajoutez-la dans Environnement.')
  if (!openaiInstance) openaiInstance = new OpenAI({ apiKey: key })
  return openaiInstance
}

function getAnthropicClient() {
  const key = getSetting('ANTHROPIC_API_KEY')
  if (!key) throw new Error('ANTHROPIC_API_KEY non configure. Ajoutez-la dans Environnement.')
  if (!anthropicInstance) anthropicInstance = new Anthropic({ apiKey: key })
  return anthropicInstance
}

// --- Unified completion interface ---

/**
 * @param {Object} opts
 * @param {string} opts.provider - 'openai' | 'anthropic'
 * @param {string} opts.model - e.g. 'gpt-4.1-mini', 'claude-sonnet-4-20250514'
 * @param {string} opts.systemPrompt - system message
 * @param {Array} opts.messages - conversation messages [{role, content}]
 * @param {Array} [opts.tools] - tool definitions in OpenAI format
 * @param {Object} [opts.responseFormat] - for structured output (JSON schema)
 * @returns {Promise<{content: string, toolCalls: Array|null, usage: Object}>}
 */
export async function createCompletion({ provider, model, systemPrompt, messages, tools, responseFormat }) {
  if (provider === 'anthropic') {
    return anthropicCompletion({ model, systemPrompt, messages, tools, responseFormat })
  }
  return openaiCompletion({ model, systemPrompt, messages, tools, responseFormat })
}

// --- OpenAI implementation ---

async function openaiCompletion({ model, systemPrompt, messages, tools, responseFormat }) {
  const client = getOpenAIClient()

  const apiMessages = []
  if (systemPrompt) {
    apiMessages.push({ role: 'system', content: systemPrompt })
  }
  for (const msg of messages) {
    // Pass through tool-related messages as-is (they have tool_calls / tool_call_id)
    if (msg.tool_calls || msg.role === 'tool') {
      apiMessages.push(msg)
    } else {
      apiMessages.push({ role: msg.role, content: msg.content })
    }
  }

  const params = {
    model: model || 'gpt-4.1-mini',
    messages: apiMessages,
  }

  if (tools && tools.length > 0) {
    params.tools = tools.map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters || {},
      },
    }))
  }

  if (responseFormat) {
    params.response_format = { type: 'json_object' }
    // Append JSON instruction to system prompt if not already there
    const lastSystem = apiMessages.find(m => m.role === 'system')
    if (lastSystem && !lastSystem.content.includes('JSON')) {
      lastSystem.content += '\n\nYou must respond with valid JSON only.'
    }
  }

  const response = await client.chat.completions.create(params)
  const choice = response.choices[0]

  const toolCalls = choice.message.tool_calls
    ? choice.message.tool_calls.map(tc => ({
        id: tc.id,
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments),
      }))
    : null

  return {
    content: choice.message.content || '',
    toolCalls,
    usage: response.usage,
  }
}

// --- Anthropic implementation ---

async function anthropicCompletion({ model, systemPrompt, messages, tools, responseFormat }) {
  const client = getAnthropicClient()

  // Convert messages to Anthropic format (no system role in messages)
  const apiMessages = messages.map(msg => ({
    role: msg.role === 'system' ? 'user' : msg.role,
    content: msg.content,
  }))

  const params = {
    model: model || 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: apiMessages,
  }

  if (systemPrompt) {
    params.system = systemPrompt
  }

  if (tools && tools.length > 0) {
    params.tools = tools.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters || { type: 'object', properties: {} },
    }))
  }

  if (responseFormat) {
    // For structured output, instruct in system prompt
    if (params.system && !params.system.includes('JSON')) {
      params.system += '\n\nYou must respond with valid JSON only.'
    }
  }

  const response = await client.messages.create(params)

  // Extract text content and tool use blocks
  let content = ''
  let toolCalls = null

  for (const block of response.content) {
    if (block.type === 'text') {
      content += block.text
    } else if (block.type === 'tool_use') {
      if (!toolCalls) toolCalls = []
      toolCalls.push({
        id: block.id,
        name: block.name,
        arguments: block.input,
      })
    }
  }

  return {
    content,
    toolCalls,
    usage: { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens },
  }
}

// --- Tool result formatting ---

/**
 * Build a tool result message for the next LLM call.
 * Returns in the format appropriate for either provider.
 */
export function buildToolResultMessage(provider, toolCallId, toolName, result) {
  if (provider === 'anthropic') {
    return {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: toolCallId,
          content: typeof result === 'string' ? result : JSON.stringify(result),
        },
      ],
    }
  }

  // OpenAI format
  return {
    role: 'tool',
    tool_call_id: toolCallId,
    content: typeof result === 'string' ? result : JSON.stringify(result),
  }
}

/**
 * Build an assistant message that contains tool calls (for continuing the conversation).
 */
export function buildAssistantToolCallMessage(provider, content, toolCalls) {
  if (provider === 'anthropic') {
    const blocks = []
    if (content) blocks.push({ type: 'text', text: content })
    for (const tc of toolCalls) {
      blocks.push({
        type: 'tool_use',
        id: tc.id,
        name: tc.name,
        input: tc.arguments,
      })
    }
    return { role: 'assistant', content: blocks }
  }

  // OpenAI format
  return {
    role: 'assistant',
    content: content || null,
    tool_calls: toolCalls.map(tc => ({
      id: tc.id,
      type: 'function',
      function: {
        name: tc.name,
        arguments: JSON.stringify(tc.arguments),
      },
    })),
  }
}

/**
 * Reset cached clients (useful when settings change).
 */
export function resetClients() {
  openaiInstance = null
  anthropicInstance = null
}
