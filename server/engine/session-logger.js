/**
 * Session logging — direct Supabase calls.
 * Replaces the n8n Code nodes that called /api/agent/sessions and /api/agent/messages via HTTP.
 */

/**
 * Create or find an existing open session for a conversation.
 * Idempotent by chatwoot_conversation_id + user_id.
 *
 * @param {Object} supabase
 * @param {Object} data
 * @param {string} data.user_id
 * @param {number} [data.inbox_id] - Internal inbox ID (nullable)
 * @param {number} [data.chatwoot_account_id]
 * @param {number} [data.chatwoot_inbox_id]
 * @param {number} data.chatwoot_conversation_id
 * @returns {Promise<{session: Object, created: boolean}>}
 */
export async function createOrFindSession(supabase, data) {
  const { user_id, chatwoot_conversation_id } = data

  // Check for existing open session
  const { data: existing } = await supabase
    .from('sessions')
    .select('id')
    .eq('chatwoot_conversation_id', chatwoot_conversation_id)
    .eq('user_id', user_id)
    .eq('status', 'open')
    .limit(1)

  if (existing && existing.length > 0) {
    return { session: existing[0], created: false }
  }

  // Create new session
  const { data: session, error } = await supabase
    .from('sessions')
    .insert({
      user_id,
      inbox_id: data.inbox_id || null,
      chatwoot_account_id: data.chatwoot_account_id || null,
      chatwoot_inbox_id: data.chatwoot_inbox_id || null,
      chatwoot_conversation_id,
      status: 'open',
    })
    .select()
    .single()

  if (error) throw error
  return { session, created: true }
}

/**
 * Log a message in conversation_messages.
 *
 * @param {Object} supabase
 * @param {Object} data
 * @param {string} data.session_id
 * @param {string} data.user_id
 * @param {'user'|'assistant'} data.role
 * @param {string} data.content
 * @param {string} [data.playbook_id]
 * @param {string} [data.escalation_id]
 * @param {Object} [data.metadata]
 */
export async function logMessage(supabase, data) {
  const { error } = await supabase
    .from('conversation_messages')
    .insert({
      session_id: data.session_id,
      user_id: data.user_id,
      role: data.role,
      content: data.content,
      playbook_id: data.playbook_id || null,
      escalation_id: data.escalation_id || null,
      metadata: data.metadata || null,
    })

  if (error) {
    console.error('Error logging message:', error.message)
  }
}

/**
 * Close a session with a reason.
 *
 * @param {Object} supabase
 * @param {string} sessionId
 * @param {string} reason - e.g. "ESCALATION: <summary>"
 * @param {boolean} [billable=false]
 */
export async function closeSession(supabase, sessionId, reason, billable = false) {
  const { error } = await supabase
    .from('sessions')
    .update({
      status: 'closed',
      ai_reason: reason,
      billable,
      closed_at: new Date().toISOString(),
    })
    .eq('id', sessionId)

  if (error) {
    console.error('Error closing session:', error.message)
  }
}
