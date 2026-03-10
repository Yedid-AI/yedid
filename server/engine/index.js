import { routeMessage } from './router.js'
import { runPlaybookAgent } from './playbook-agent.js'
import { runEscalationAgent } from './escalation-agent.js'
import { getConversationHistory } from './memory.js'
import { sendMessage, sendMessageWithAudio, assignConversation, sendPrivateNote } from './chatwoot-messaging.js'
import { generateTTS } from './voice.js'
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
  // --- Debug logging ---
  const msg0 = webhookBody.conversation?.messages?.[0]
  console.log(`[Engine] Webhook: type=${webhookBody.message_type} status=${webhookBody.conversation?.status} content="${(msg0?.content || '').slice(0, 50)}" attachments=${JSON.stringify(msg0?.attachments?.map(a => ({ file_type: a.file_type, data_url: !!a.data_url })) || [])}`)

  // --- 1. Filter ---
  if (!shouldProcess(webhookBody)) return

  const message = webhookBody.conversation?.messages?.[0]
  const inboxId = message?.inbox_id
  const conversationId = message?.conversation_id
  const accountId = webhookBody.account?.id

  // --- Voice detection (🎤 marker set by Unipile webhook after Whisper transcription) ---
  let userMessage = message?.processed_message_content || message?.content || ''
  let isVoiceMessage = false

  if (userMessage.startsWith('🎤 ')) {
    isVoiceMessage = true
    userMessage = userMessage.slice(3) // Strip 🎤 marker
    console.log(`[Engine] Voice message detected: "${userMessage.slice(0, 100)}"`)
  }

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

    // --- 2b. Check AI availability (toggle + schedule) ---
    if (!isAiAvailable(config)) {
      console.log(`[Engine] AI unavailable for inbox ${inboxId} (disabled or outside schedule)`)
      return
    }

    // --- 3. Session + Memory ---
    const { session, created } = await createOrFindSession(supabase, {
      user_id: userId,
      inbox_id: inboxDbId,
      chatwoot_account_id: accountId,
      chatwoot_inbox_id: inboxId,
      chatwoot_conversation_id: conversationId,
    })

    // Detect preview conversations (from InboxDetail widget preview)
    const isPreview = webhookBody.conversation?.custom_attributes?.yedid_preview === 'true'
    if (isPreview && created) {
      await supabase.from('sessions').update({
        billable: false,
        ai_reason: 'PREVIEW/TEST',
      }).eq('id', session.id)
      console.log(`[Engine] Preview session ${session.id} marked as non-billable`)
    }

    const conversationHistory = await getConversationHistory(supabase, session.id, 10)

    // --- 3b. Extract contact context from Chatwoot webhook ---
    const sender = webhookBody.conversation?.meta?.sender || {}
    const contactContext = {
      phone: sender.phone_number || null,
      name: sender.name || null,
      ...(sender.custom_attributes || {}),
    }

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
        isVoiceMessage, contactContext,
      })
    } else {
      await handleEscalation({
        config, escalationRules, route, userMessage, conversationHistory,
        supabase, accountId, conversationId, session, webhookBody, contactContext,
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

// --- AI availability check (toggle + schedule) ---

const DAY_MAP = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

function isAiAvailable(config) {
  if (config.aiEnabled === false) return false
  if (!config.aiSchedule) return true // null = 24/7

  const tz = config.aiTimezone || 'UTC'
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    hour12: false,
    weekday: 'short',
  }).formatToParts(new Date())

  const day = DAY_MAP[parts.find(p => p.type === 'weekday').value]
  const hour = parseInt(parts.find(p => p.type === 'hour').value)

  const daySchedule = config.aiSchedule[String(day)]
  if (!daySchedule) return false

  return daySchedule[hour] === true
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
    .select('id, user_id, agent_bot_id, ai_enabled, ai_schedule, ai_timezone')
    .eq('inbox_id', parseInt(inboxId))
    .limit(1)

  if (inError || !inboxes || inboxes.length === 0) return null

  const { id: inboxDbId, user_id: userId, agent_bot_id: agentBotId } = inboxes[0]
  if (!agentBotId) return null

  // Parallel fetch: bot token, config, playbooks, escalation rules, chatwoot user, all tools
  const [botsRes, configsRes, playbookRes, escalationRes, cwRes, toolsRes] = await Promise.all([
    supabase.from('agent_bots').select('bot_token').eq('id', agentBotId).limit(1),
    supabase.from('agent_config').select('*').eq('agent_bot_id', agentBotId).limit(1),
    supabase.from('agent_bot_playbooks')
      .select('playbook_id, playbooks(id, title, content, audience, rules, is_active)')
      .eq('agent_bot_id', agentBotId),
    supabase.from('agent_bot_escalation_rules')
      .select('escalation_rule_id, escalation_rules(*)')
      .eq('agent_bot_id', agentBotId),
    supabase.from('chatwoot_accounts')
      .select('chatwoot_user_id')
      .eq('user_id', userId)
      .limit(1),
    supabase.from('tools')
      .select('id, name, description, method, url, query_parameters, headers, body_schema, type, handler, emoji')
      .eq('agent_bot_id', agentBotId),
  ])

  // Decrypt bot token (supports legacy plaintext)
  const rawToken = botsRes.data?.[0]?.bot_token || null
  const botToken = rawToken ? decrypt(rawToken) : null

  const agentConfig = configsRes.data?.[0] || null

  const allTools = toolsRes.data || []

  const formattedPlaybooks = (playbookRes.data || [])
    .map(j => j.playbooks)
    .filter(pb => pb && pb.is_active)

  const escalationRules = (escalationRes.data || [])
    .map(j => j.escalation_rules)
    .filter(er => er && er.is_active)

  const chatwootUserId = cwRes.data?.[0]?.chatwoot_user_id || null

  const result = {
    userId,
    inboxDbId,
    aiEnabled: inboxes[0].ai_enabled,
    aiSchedule: inboxes[0].ai_schedule,
    aiTimezone: inboxes[0].ai_timezone,
    botToken,
    agentConfig,
    playbooks: formattedPlaybooks,
    allTools,
    escalationRules: escalationRules || [],
    chatwootUserId,
  }

  // Cache the result
  setCachedConfig(inboxId, result)
  return result
}

// --- Scenario path ---

async function handleScenario({ config, playbooks, route, userMessage, conversationHistory, supabase, accountId, conversationId, session, isVoiceMessage, contactContext }) {
  const { userId, botToken, agentConfig, allTools } = config

  // Find active playbook
  const playbook = playbooks.find(pb => String(pb.id) === route.id)
  if (!playbook) {
    console.error(`[Engine] Playbook not found: ${route.id}`)
    return
  }

  // Run playbook agent with all agent tools
  const result = await runPlaybookAgent({
    agentConfig,
    playbook,
    agentTools: allTools || [],
    userMessage,
    conversationHistory,
    supabase,
    userId,
    contactContext,
  })

  if (!result || !result.content) {
    console.error(`[Engine] Empty response from playbook agent for conversation ${conversationId}`)
    return
  }

  const { content: response, metadata: agentMetadata } = result

  // Split on --- for multi-message support (human-like chat bubbles)
  const messageParts = response.split(/\n?---\n?/).map(p => p.trim()).filter(Boolean)

  // Send each part as a separate message with a small delay
  for (let i = 0; i < messageParts.length; i++) {
    if (i > 0) await new Promise(r => setTimeout(r, 800 + Math.random() * 700))

    if (isVoiceMessage) {
      // Voice flow: send TTS audio + text
      try {
        const { audioBuffer, contentType, fileName } = await generateTTS(messageParts[i])
        await sendMessageWithAudio(accountId, conversationId, messageParts[i], audioBuffer, fileName, contentType, botToken)
      } catch (ttsErr) {
        console.error(`[Engine] TTS failed, falling back to text:`, ttsErr.message)
        await sendMessage(accountId, conversationId, messageParts[i], botToken)
      }
    } else {
      await sendMessage(accountId, conversationId, messageParts[i], botToken)
    }
  }

  // Log user message + agent response (full content in single log entry)
  await logMessage(supabase, {
    session_id: session.id,
    user_id: userId,
    role: 'user',
    content: userMessage,
    playbook_id: playbook.id,
    metadata: isVoiceMessage ? { transcription_source: 'whisper-1', voice: true } : undefined,
  })

  await logMessage(supabase, {
    session_id: session.id,
    user_id: userId,
    role: 'assistant',
    content: response,
    playbook_id: playbook.id,
    metadata: {
      ...agentMetadata,
      ...(isVoiceMessage ? { voice_response: true } : {}),
    },
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
