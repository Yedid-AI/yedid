import OpenAI from 'openai'
import { getSetting } from '../settings.js'

function getOpenAI() {
  const key = getSetting('OPENAI_API_KEY')
  if (!key) throw new Error('OPENAI_API_KEY non configure.')
  return new OpenAI({ apiKey: key })
}

/**
 * Search the knowledge base (vector_store) for relevant chunks.
 * Always uses OpenAI embeddings regardless of LLM provider (embeddings are provider-independent).
 *
 * @param {Object} supabase - Supabase client (service role recommended)
 * @param {string} query - User's search query
 * @param {string} userId - Filter by user_id in metadata
 * @param {number} [topK=5] - Number of results to return
 * @returns {Promise<Array<{content: string, similarity: number}>>}
 */
export async function searchKnowledgeBase(supabase, query, userId, topK = 5) {
  // 1. Embed the query
  const embeddingRes = await getOpenAI().embeddings.create({
    model: 'text-embedding-3-small',
    input: query,
  })
  const queryEmbedding = embeddingRes.data[0].embedding

  // 2. Search using Supabase RPC (match_vectors function)
  const { data, error } = await supabase.rpc('match_vectors', {
    query_embedding: queryEmbedding,
    match_count: topK,
    filter_user_id: userId,
  })

  if (error) {
    console.error('Vector search error:', error.message)
    // Fallback: direct query if RPC not available
    return fallbackSearch(supabase, queryEmbedding, userId, topK)
  }

  return (data || []).map(row => ({
    content: row.content,
    similarity: row.similarity,
  }))
}

/**
 * Fallback search using direct Supabase query (if match_vectors RPC is not deployed yet).
 */
async function fallbackSearch(supabase, queryEmbedding, userId, topK) {
  // Use the ordering capability of Supabase with pgvector
  // This requires the vector extension and proper column type
  const { data, error } = await supabase
    .from('vector_store')
    .select('content, metadata')
    .filter('metadata->>user_id', 'eq', userId)
    .limit(topK * 3) // fetch more, re-rank client-side if needed

  if (error) {
    console.error('Fallback vector search error:', error.message)
    return []
  }

  // Without server-side vector distance, return all matches (unranked)
  return (data || []).map(row => ({
    content: row.content,
    similarity: 0, // No ranking in fallback mode
  }))
}

/**
 * Format knowledge base results into a context string for the LLM.
 */
export function formatKBResults(results) {
  if (!results || results.length === 0) return ''

  return results
    .map((r, i) => `[Source ${i + 1}]\n${r.content}`)
    .join('\n\n---\n\n')
}

/**
 * Tool definition for knowledge base search (used in function calling).
 */
export const knowledgeBaseToolDef = {
  name: 'search_knowledge_base',
  description: 'Search the company knowledge base to answer user questions. Contains product information, policies, procedures, FAQs, and support documentation. Use this tool before saying you don\'t have information. Query with specific keywords from the user\'s question.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query to find relevant information in the knowledge base',
      },
    },
    required: ['query'],
  },
}
