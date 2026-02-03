import { accountApi } from '../chatwoot.js'

const MAX_RETRIES = 3
const BASE_DELAY_MS = 1000

async function withRetry(fn, label = 'Chatwoot') {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (attempt === MAX_RETRIES) throw err
      const delay = BASE_DELAY_MS * Math.pow(2, attempt)
      console.warn(`[${label}] Attempt ${attempt + 1} failed, retrying in ${delay}ms: ${err.message}`)
      await new Promise(r => setTimeout(r, delay))
    }
  }
}

/**
 * Send a message to a Chatwoot conversation (with retry + exponential backoff).
 */
export async function sendMessage(accountId, conversationId, content, botToken, opts = {}) {
  const path = `/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`
  const body = {
    content,
    message_type: 'outgoing',
  }
  if (opts.private) {
    body.private = true
  }
  return withRetry(() => accountApi(path, 'POST', body, botToken), 'sendMessage')
}

/**
 * Assign a conversation to a human agent (with retry).
 */
export async function assignConversation(accountId, conversationId, assigneeId, botToken) {
  const path = `/api/v1/accounts/${accountId}/conversations/${conversationId}/assignments`
  return withRetry(() => accountApi(path, 'POST', { assignee_id: assigneeId }, botToken), 'assignConversation')
}

/**
 * Send a private note (with retry via sendMessage).
 */
export async function sendPrivateNote(accountId, conversationId, content, botToken) {
  return sendMessage(accountId, conversationId, content, botToken, { private: true })
}

/**
 * Set conversation status (pending, open, resolved, snoozed).
 * Use "pending" to keep the widget open after bot response.
 */
export async function setConversationStatus(accountId, conversationId, status, botToken) {
  const path = `/api/v1/accounts/${accountId}/conversations/${conversationId}/toggle_status`
  return withRetry(() => accountApi(path, 'POST', { status }, botToken), 'setConversationStatus')
}
