import { Router } from 'express'
import { checkRole } from '../middleware.js'

const router = Router()

// GET /api/sessions?inbox_id=X&status=open|closed
router.get('/sessions', checkRole('admin'), async (req, res) => {
  try {
    let query = req.supabase
      .from('sessions')
      .select('*')
      .eq('user_id', req.user.user_id)
      .order('created_at', { ascending: false })

    if (req.query.inbox_id) {
      query = query.eq('inbox_id', req.query.inbox_id)
    }
    if (req.query.status) {
      query = query.eq('status', req.query.status)
    }

    const { data, error } = await query
    if (error) throw error

    // Fetch message counts per session
    const sessionIds = data.map((s) => s.id)
    const countMap = {}
    if (sessionIds.length > 0) {
      const { data: msgs } = await req.supabase
        .from('conversation_messages')
        .select('session_id')
        .in('session_id', sessionIds)
      for (const m of msgs || []) {
        countMap[m.session_id] = (countMap[m.session_id] || 0) + 1
      }
    }

    // Enrich sessions
    const sessions = data.map((s) => ({
      ...s,
      message_count: countMap[s.id] || 0,
      duration_seconds: s.closed_at
        ? Math.round((new Date(s.closed_at) - new Date(s.created_at)) / 1000)
        : null,
    }))

    // Compute stats
    const stats = {
      total: sessions.length,
      open: sessions.filter((s) => s.status === 'open').length,
      closed: sessions.filter((s) => s.status === 'closed').length,
      billable: sessions.filter((s) => s.billable).length,
      avg_confidence:
        sessions.length > 0
          ? +(sessions.reduce((sum, s) => sum + (s.ai_confidence || 0), 0) / sessions.length).toFixed(2)
          : 0,
    }

    res.json({ sessions, stats })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/sessions/:id
router.get('/sessions/:id', checkRole('admin'), async (req, res) => {
  try {
    const { id } = req.params
    const { data, error } = await req.supabase
      .from('sessions')
      .select('*')
      .eq('id', id)
      .eq('user_id', req.user.user_id)
      .single()

    if (error) throw error
    if (!data) return res.status(404).json({ error: 'Session introuvable' })
    res.json({ session: data })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/sessions/:id/messages
router.get('/sessions/:id/messages', checkRole('admin'), async (req, res) => {
  try {
    const { id } = req.params

    // Verify session ownership
    const { data: session } = await req.supabase
      .from('sessions')
      .select('id')
      .eq('id', id)
      .eq('user_id', req.user.user_id)
      .single()

    if (!session) return res.status(404).json({ error: 'Session introuvable' })

    const { data, error } = await req.supabase
      .from('conversation_messages')
      .select('*')
      .eq('session_id', id)
      .order('created_at', { ascending: true })

    if (error) throw error
    res.json({ messages: data })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
