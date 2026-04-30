import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../lib/auth'

// Maps Supabase table names → React Query key PREFIXES to invalidate.
// Each value is an array of queryKey prefixes (so a single table change can fan out to
// multiple unrelated query trees, e.g. user_branches affects both branches and users views).
// React-Query invalidates by prefix match, so e.g. ['leads'] hits ['leads', filters] etc.
// Keep in sync with WATCHED_TABLES in server/routes/realtime.js. Names of the actual query
// keys live in src/lib/query-keys.js — match against the FIRST element used there.
const TABLE_TO_KEYS = {
  leads: [['leads']],
  lead_activities: [['leads']],
  lead_affiliations: [['leads']],
  lead_documents: [['leads']],
  sessions: [['sessions']],
  conversation_messages: [['sessions']],
  calls: [['calls']],
  agent_bots: [['agents']],
  inboxes: [['inboxes']],
  users: [['users']],
  branches: [['branches']],
  user_branches: [['branches'], ['users']],
  // Playbooks/tools/escalation queries live under 'agents' (per-agent) and '*-library' (shared).
  playbooks: [['playbooks-library'], ['agents']],
  tools: [['tools-library'], ['agents']],
  escalation_rules: [['escalation-rules-library'], ['agents']],
  dispatch_config: [['dispatch-config']],
  followup_config: [['followup-config'], ['followup-sources'], ['followup-stats']],
  followup_queue: [['followup-queue'], ['followup-stats']],
  chat_inboxes: [['chat-inboxes']],
  chat_conversations: [['chat-conversations'], ['chat-unread']],
  chat_messages: [['chat-messages'], ['chat-conversations'], ['chat-unread']],
}

// Debounce: batch rapid changes into a single invalidation
function createDebouncer(fn, ms = 500) {
  const pending = new Set()
  let timer = null
  return (key) => {
    const keyStr = JSON.stringify(key)
    pending.add(keyStr)
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      for (const k of pending) fn(JSON.parse(k))
      pending.clear()
      timer = null
    }, ms)
  }
}

export function useRealtimeInvalidation() {
  const qc = useQueryClient()
  const { isAuthenticated } = useAuth()
  const abortRef = useRef(null)
  const retryRef = useRef(0)

  useEffect(() => {
    if (!isAuthenticated) return

    const debounceInvalidate = createDebouncer((key) => {
      qc.invalidateQueries({ queryKey: key })
    }, 500)

    function connect() {
      const token = localStorage.getItem('token')
      if (!token) return

      const controller = new AbortController()
      abortRef.current = controller

      fetch('/api/events', {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      })
        .then((res) => {
          if (!res.ok) throw new Error(`SSE ${res.status}`)
          retryRef.current = 0
          const reader = res.body.getReader()
          const decoder = new TextDecoder()
          let buffer = ''

          function read() {
            reader.read().then(({ done, value }) => {
              if (done) {
                scheduleRetry()
                return
              }
              buffer += decoder.decode(value, { stream: true })
              const lines = buffer.split('\n')
              buffer = lines.pop() || ''

              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  try {
                    const data = JSON.parse(line.slice(6))
                    if (data.type === 'connected') continue
                    const keys = TABLE_TO_KEYS[data.table]
                    if (keys) for (const k of keys) debounceInvalidate(k)
                  } catch { /* ignore */ }
                }
              }
              read()
            }).catch((err) => {
              if (err.name !== 'AbortError') scheduleRetry()
            })
          }
          read()
        })
        .catch((err) => {
          if (err.name !== 'AbortError') scheduleRetry()
        })
    }

    function scheduleRetry() {
      const delay = Math.min(1000 * Math.pow(2, retryRef.current), 30_000)
      retryRef.current++
      setTimeout(connect, delay)
    }

    connect()

    return () => {
      if (abortRef.current) {
        abortRef.current.abort()
        abortRef.current = null
      }
    }
  }, [isAuthenticated, qc])
}
