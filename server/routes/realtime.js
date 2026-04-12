import { Router } from 'express'

const router = Router()

// ─── SSE: Server-Sent Events for realtime invalidation ───
// Backend subscribes to Supabase Realtime (service_role) once,
// then fans out lightweight "invalidate" events to connected clients.
// Frontend receives table names and invalidates React Query caches.

const clients = new Map() // userId -> Set<res>

let realtimeChannel = null
let supabaseRef = null

export function initRealtime(supabaseAdmin) {
  if (!supabaseAdmin || realtimeChannel) return
  supabaseRef = supabaseAdmin

  const WATCHED_TABLES = [
    'leads', 'lead_activities', 'lead_affiliations', 'lead_documents',
    'sessions', 'conversation_messages',
    'calls',
    'agent_bots', 'inboxes',
  ]

  realtimeChannel = supabaseAdmin
    .channel('db-changes')

  for (const table of WATCHED_TABLES) {
    realtimeChannel = realtimeChannel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table },
      (payload) => {
        broadcast({ table, event: payload.eventType })
      }
    )
  }

  realtimeChannel.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      console.log(`[realtime] Subscribed to ${WATCHED_TABLES.length} tables`)
    }
    if (status === 'CHANNEL_ERROR') {
      console.error('[realtime] Channel error — will retry')
    }
  })
}

function broadcast(data) {
  const msg = `data: ${JSON.stringify(data)}\n\n`
  for (const [, sessions] of clients) {
    for (const res of sessions) {
      res.write(msg)
    }
  }
}

// SSE endpoint — auth via Authorization header or query param fallback
router.get('/events', async (req, res) => {
  const authHeader = req.headers.authorization
  const token = (authHeader && authHeader.startsWith('Bearer '))
    ? authHeader.split(' ')[1]
    : req.query.token
  if (!token || !supabaseRef) {
    return res.status(401).json({ error: 'Non autorise' })
  }

  // Verify token via Supabase GoTrue
  try {
    const { data: { user: authUser }, error } = await supabaseRef.auth.getUser(token)
    if (error || !authUser) {
      console.error('[realtime] Auth failed:', error?.message || 'no user')
      return res.status(401).json({ error: 'Token invalide' })
    }

    const { data: users } = await supabaseRef
      .from('users')
      .select('id')
      .eq('auth_id', authUser.id)
      .limit(1)

    if (!users?.length) {
      return res.status(401).json({ error: 'Utilisateur introuvable' })
    }

    const userId = users[0].id

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })

    res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`)

    const heartbeat = setInterval(() => {
      res.write(': heartbeat\n\n')
    }, 30_000)

    if (!clients.has(userId)) clients.set(userId, new Set())
    clients.get(userId).add(res)

    req.on('close', () => {
      clearInterval(heartbeat)
      const set = clients.get(userId)
      if (set) {
        set.delete(res)
        if (set.size === 0) clients.delete(userId)
      }
    })
  } catch {
    return res.status(401).json({ error: 'Token invalide' })
  }
})

export default router
