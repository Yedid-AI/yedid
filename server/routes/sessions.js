import { Router } from 'express'
import { checkRole } from '../middleware.js'

const router = Router()

// GET /api/sessions?inbox_id=X&status=open|closed
router.get('/sessions', checkRole('admin'), async (req, res) => {
  try {
    // Fetch ALL sessions (unfiltered) for global stats
    const { data: allData, error: allErr } = await req.supabase
      .from('sessions')
      .select('*')
      .eq('user_id', req.user.user_id)
      .order('created_at', { ascending: false })

    if (allErr) throw allErr

    // Global stats (always computed from full dataset)
    const withConfidence = allData.filter((s) => s.ai_confidence != null)
    const stats = {
      total: allData.length,
      open: allData.filter((s) => s.status === 'open').length,
      closed: allData.filter((s) => s.status === 'closed').length,
      billable: allData.filter((s) => s.billable).length,
      avg_confidence:
        withConfidence.length > 0
          ? +(withConfidence.reduce((sum, s) => sum + s.ai_confidence, 0) / withConfidence.length).toFixed(2)
          : null,
    }

    // Apply filters for table view
    let filtered = allData
    if (req.query.inbox_id) {
      filtered = filtered.filter((s) => s.inbox_id === req.query.inbox_id)
    }
    if (req.query.status) {
      filtered = filtered.filter((s) => s.status === req.query.status)
    }

    // Fetch message counts for visible sessions
    const sessionIds = filtered.map((s) => s.id)
    const countMap = {}
    if (sessionIds.length > 0) {
      const { data: msgs } = await req.supabase
        .from('conversation_messages')
        .select('session_id')
        .in('session_id', sessionIds)
        .limit(50000)
      for (const m of msgs || []) {
        countMap[m.session_id] = (countMap[m.session_id] || 0) + 1
      }
    }

    // Enrich filtered sessions
    const sessions = filtered.map((s) => ({
      ...s,
      message_count: countMap[s.id] || 0,
      duration_seconds: s.closed_at
        ? Math.round((new Date(s.closed_at) - new Date(s.created_at)) / 1000)
        : null,
    }))

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
