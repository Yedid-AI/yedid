/**
 * Conversation memory management.
 * Loads the last N messages from conversation_messages for a given session,
 * or by chatwoot_conversation_id if no session exists yet.
 */

/**
 * Get conversation history for a session.
 * @param {Object} supabase - Supabase client
 * @param {string} sessionId - Session UUID
 * @param {number} [limit=10] - Max messages to return
 * @returns {Promise<Array<{role: string, content: string}>>}
 */
export async function getConversationHistory(supabase, sessionId, limit = 10) {
  if (!sessionId) return []

  const { data: messages, error } = await supabase
    .from('conversation_messages')
    .select('role, content, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Error loading conversation history:', error.message)
    return []
  }

  if (!messages || messages.length === 0) return []

  // Take last N messages
  const recent = messages.slice(-limit)

  return recent.map(m => ({
    role: m.role,
    content: m.content,
  }))
}

/**
 * Find an existing open session by chatwoot_conversation_id + user_id.
 * @param {Object} supabase
 * @param {string} chatwootConversationId
 * @param {string} userId
 * @returns {Promise<Object|null>} session row or null
 */
export async function findOpenSession(supabase, chatwootConversationId, userId) {
  const { data, error } = await supabase
    .from('sessions')
    .select('id')
    .eq('chatwoot_conversation_id', chatwootConversationId)
    .eq('user_id', userId)
    .eq('status', 'open')
    .limit(1)

  if (error || !data || data.length === 0) return null
  return data[0]
}
