import { routeMessage } from './router.js'
import { runPlaybookAgent } from './playbook-agent.js'
import { runEscalationAgent } from './escalation-agent.js'
import { getConversationHistory } from './memory.js'
import { sendMessage, assignConversation, sendPrivateNote, setConversationStatus } from './chatwoot-messaging.js'
import { createOrFindSession, logMessage, closeSession } from './session-logger.js'
import { decrypt } from '../crypto.js'

// --- In-memory config cache (TTL-based) ---
const configCache = new Map()
const CACHE_TTL_MS = 60_000 // 1 minute

function getCachedConfig(inboxId) {
  const entry = configCache.get(inboxId)
  if (!entry) return null
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    configCache.delete(inboxId)
    return null
  }
  return entry.data
}

function setCachedConfig(inboxId, data) {
  configCache.set(inboxId, { data, ts: Date.now() })
}

export function clearConfigCache() {
  configCache.clear()
}

/**
 * Main orchestrator — handles a Chatwoot webhook event end-to-end.
 * Replaces the entire n8n workflow.
 *
 * @param {Object} webhookBody - Raw Chatwoot webhook payload
 * @param {Object} supabase - Supabase client (service role)
 */
export async function handleWebhook(webhookBody, supabase) {
  // --- 1. Filter ---
  if (!shouldProcess(webhookBody)) return

  const message = webhookBody.conversation?.messages?.[0]
  const userMessage = message?.processed_message_content || message?.content
  const inboxId = message?.inbox_id
  const conversationId = message?.conversation_id
  const accountId = webhookBody.account?.id

  if (!userMessage || !inboxId) {
    console.log('[Engine] Skipping: no user message or inbox_id')
    return
  }

  try {
    console.log(`[Engine] Processing message for inbox ${inboxId}, conversation ${conversationId}`)

    // --- 2. Load agent config ---
    const config = await loadAgentConfig(supabase, inboxId)
    if (!config) {
      console.log(`[Engine] No agent config found for inbox ${inboxId}`)
      return
    }

    const { userId, inboxDbId, botToken, agentConfig, playbooks, escalationRules } = config

    if (!agentConfig || !botToken) {
      console.log(`[Engine] Missing agent config or bot token for inbox ${inboxId}`)
      return
    }

    // --- 3. Session + Memory ---
    const { session } = await createOrFindSession(supabase, {
      user_id: userId,
      inbox_id: inboxDbId,
      chatwoot_account_id: accountId,
      chatwoot_inbox_id: inboxId,
      chatwoot_conversation_id: conversationId,
    })

    const conversationHistory = await getConversationHistory(supabase, session.id, 10)

    // --- 4. Route (with last active playbook context) ---
    const lastPlaybookId = await getLastPlaybookId(supabase, session.id)
    const route = await routeMessage({
      agentConfig,
      playbooks,
      escalationRules,
      userMessage,
      conversationHistory,
      lastPlaybookId,
    })

    console.log(`[Engine] Route decision: ${route.type} → ${route.id}`)

    // --- 5. Execute ---
    if (route.type === 'scenario') {
      await handleScenario({
        config, playbooks, route, userMessage, conversationHistory,
        supabase, accountId, conversationId, session,
      })
    } else {
      await handleEscalation({
        config, escalationRules, route, userMessage, conversationHistory,
        supabase, accountId, conversationId, session, webhookBody,
      })
    }
  } catch (err) {
    console.error(`[Engine] Fatal error processing inbox ${inboxId}, conversation ${conversationId}:`, err.message)
  }
}

// --- Get last active playbook from session history ---

async function getLastPlaybookId(supabase, sessionId) {
  if (!sessionId) return null

  const { data, error } = await supabase
    .from('conversation_messages')
    .select('playbook_id')
    .eq('session_id', sessionId)
    .not('playbook_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)

  if (error || !data || data.length === 0) return null
  return String(data[0].playbook_id)
}

// --- Filter incoming messages (same as n8n Filter Incoming node) ---

function shouldProcess(body) {
  if (body.message_type !== 'incoming') return false
  const message = body.conversation?.messages?.[0]
  if (!message?.content && !message?.processed_message_content) return false
  if (body.conversation?.status === 'open') return false
  return true
}

// --- Load agent config from inbox_id ---

async function loadAgentConfig(supabase, inboxId) {
  // Check cache first
  const cached = getCachedConfig(inboxId)
  if (cached) return cached

  // Lookup inbox → agent_bot_id
  const { data: inboxes, error: inError } = await supabase
    .from('inboxes')
    .select('id, user_id, agent_bot_id')
    .eq('inbox_id', parseInt(inboxId))
    .limit(1)

  if (inError || !inboxes || inboxes.length === 0) return null

  const { id: inboxDbId, user_id: userId, agent_bot_id: agentBotId } = inboxes[0]
  if (!agentBotId) return null

  // Parallel fetch: bot token, config, playbooks, escalation rules, chatwoot user
  const [botsRes, configsRes, playbookRes, escalationRes, cwRes] = await Promise.all([
    supabase.from('agent_bots').select('bot_token').eq('id', agentBotId).limit(1),
    supabase.from('agent_config').select('*').eq('agent_bot_id', agentBotId).limit(1),
    supabase.from('agent_bot_playbooks')
      .select('playbook_id, playbooks(id, title, content, audience, rules, is_active, tools(id, name, description, method, url, query_parameters, headers, body_schema))')
      .eq('agent_bot_id', agentBotId),
    supabase.from('agent_bot_escalation_rules')
      .select('escalation_rule_id, escalation_rules(*)')
      .eq('agent_bot_id', agentBotId),
    supabase.from('chatwoot_accounts')
      .select('chatwoot_user_id')
      .eq('user_id', userId)
      .limit(1),
  ])

  // Decrypt bot token (supports legacy plaintext)
  const rawToken = botsRes.data?.[0]?.bot_token || null
  const botToken = rawToken ? decrypt(rawToken) : null

  const agentConfig = configsRes.data?.[0] || null

  const formattedPlaybooks = (playbookRes.data || [])
    .map(j => j.playbooks)
    .filter(pb => pb && pb.is_active)
    .map(pb => ({ ...pb, tool: pb.tools || null }))

  const escalationRules = (escalationRes.data || [])
    .map(j => j.escalation_rules)
    .filter(er => er && er.is_active)

  const chatwootUserId = cwRes.data?.[0]?.chatwoot_user_id || null

  const result = {
    userId,
    inboxDbId,
    botToken,
    agentConfig,
    playbooks: formattedPlaybooks,
    escalationRules: escalationRules || [],
    chatwootUserId,
  }

  // Cache the result
  setCachedConfig(inboxId, result)
  return result
}

// --- Scenario path ---

async function handleScenario({ config, playbooks, route, userMessage, conversationHistory, supabase, accountId, conversationId, session }) {
  const { userId, botToken, agentConfig } = config

  // Find active playbook
  const playbook = playbooks.find(pb => String(pb.id) === route.id)
  if (!playbook) {
    console.error(`[Engine] Playbook not found: ${route.id}`)
    return
  }

  // Run playbook agent
  const result = await runPlaybookAgent({
    agentConfig,
    playbook,
    userMessage,
    conversationHistory,
    supabase,
    userId,
  })

  if (!result || !result.content) {
    console.error(`[Engine] Empty response from playbook agent for conversation ${conversationId}`)
    return
  }

  const { content: response, metadata: agentMetadata } = result

  // Send response to Chatwoot
  await sendMessage(accountId, conversationId, response, botToken)

  // Keep conversation open (prevent Chatwoot auto-resolve)
  try {
    await setConversationStatus(accountId, conversationId, 'pending', botToken)
  } catch (e) {
    console.warn(`[Engine] Could not reset status for conversation ${conversationId}:`, e.message)
  }

  // Log user message + agent response
  await logMessage(supabase, {
    session_id: session.id,
    user_id: userId,
    role: 'user',
    content: userMessage,
    playbook_id: playbook.id,
  })

  await logMessage(supabase, {
    session_id: session.id,
    user_id: userId,
    role: 'assistant',
    content: response,
    playbook_id: playbook.id,
    metadata: agentMetadata,
  })

  console.log(`[Engine] Playbook response sent for conversation ${conversationId}`)
}

// --- Escalation path ---

async function handleEscalation({ config, escalationRules, route, userMessage, conversationHistory, supabase, accountId, conversationId, session, webhookBody }) {
  const { userId, botToken, agentConfig } = config

  // Find active rule
  const rule = escalationRules.find(er => String(er.id) === route.id)
  if (!rule) {
    console.error(`[Engine] Escalation rule not found: ${route.id}`)
    return
  }

  // Run escalation agent
  const { reponse, resume, token_usage } = await runEscalationAgent({
    agentConfig,
    rule,
    userMessage,
    conversationHistory,
  })

  // Send response to user
  await sendMessage(accountId, conversationId, reponse, botToken)

  // Assign conversation to human agent
  if (rule.assign_to_agent) {
    await assignConversation(accountId, webhookBody.conversation?.id || conversationId, rule.assign_to_agent, botToken)
  }

  // Send private note with summary
  await sendPrivateNote(accountId, conversationId, resume, botToken)

  // Log messages
  await logMessage(supabase, {
    session_id: session.id,
    user_id: userId,
    role: 'user',
    content: userMessage,
    escalation_id: rule.id,
  })

  await logMessage(supabase, {
    session_id: session.id,
    user_id: userId,
    role: 'assistant',
    content: reponse,
    escalation_id: rule.id,
    metadata: { resume, token_usage },
  })

  // Close session
  await closeSession(supabase, session.id, `ESCALATION: ${resume}`, false)

  console.log(`[Engine] Escalation handled for conversation ${conversationId}`)
}
