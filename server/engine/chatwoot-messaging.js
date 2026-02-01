import { accountApi } from '../chatwoot.js'

/**
 * Send a message to a Chatwoot conversation.
 * @param {number} accountId - Chatwoot account ID
 * @param {number} conversationId - Chatwoot conversation ID
 * @param {string} content - Message content
 * @param {string} botToken - Bot access token
 * @param {Object} [opts] - Additional options
 * @param {boolean} [opts.private] - Send as private note
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
  return accountApi(path, 'POST', body, botToken)
}

/**
 * Assign a conversation to a human agent.
 * @param {number} accountId
 * @param {number} conversationId
 * @param {number} assigneeId - Chatwoot user ID to assign to
 * @param {string} botToken
 */
export async function assignConversation(accountId, conversationId, assigneeId, botToken) {
  const path = `/api/v1/accounts/${accountId}/conversations/${conversationId}/assignments`
  return accountApi(path, 'POST', { assignee_id: assigneeId }, botToken)
}

/**
 * Send a private note (internal comment visible only to agents).
 * @param {number} accountId
 * @param {number} conversationId
 * @param {string} content
 * @param {string} botToken
 */
export async function sendPrivateNote(accountId, conversationId, content, botToken) {
  return sendMessage(accountId, conversationId, content, botToken, { private: true })
}
