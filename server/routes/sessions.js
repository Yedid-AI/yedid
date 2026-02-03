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

    // Fetch all assistant messages for stats (total AI messages + first response times)
    const allSessionIds = allData.map((s) => s.id)
    let assistantMsgs = []
    if (allSessionIds.length > 0) {
      const { data: aMsgs } = await req.supabase
        .from('conversation_messages')
        .select('session_id, created_at')
        .eq('user_id', req.user.user_id)
        .eq('role', 'assistant')
        .in('session_id', allSessionIds)
        .order('created_at', { ascending: true })
        .limit(50000)
      assistantMsgs = aMsgs || []
    }

    // Compute first response time per session (first assistant message - session created_at)
    const sessionById = Object.fromEntries(allData.map((s) => [s.id, s]))
    const firstResponseMap = {}
    for (const msg of assistantMsgs) {
      if (!firstResponseMap[msg.session_id]) {
        firstResponseMap[msg.session_id] = msg.created_at
      }
    }
    const responseTimes = []
    for (const [sid, firstMsgTime] of Object.entries(firstResponseMap)) {
      const session = sessionById[sid]
      if (session) {
        const diff = Math.round((new Date(firstMsgTime) - new Date(session.created_at)) / 1000)
        if (diff >= 0) responseTimes.push(diff)
      }
    }

    // Global stats (always computed from full dataset)
    const resolved = allData.filter((s) => s.billable).length
    const stats = {
      total: allData.length,
      total_ai_messages: assistantMsgs.length,
      resolved,
      escalated: allData.filter((s) => s.ai_reason?.startsWith('ESCALATION:')).length,
      resolution_rate: allData.length > 0 ? +(resolved / allData.length * 100).toFixed(0) : null,
      avg_first_response: responseTimes.length > 0
        ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
        : null,
    }

    // Apply filters for table view
    let filtered = allData
    if (req.query.inbox_id) {
      filtered = filtered.filter((s) => String(s.chatwoot_inbox_id) === req.query.inbox_id)
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
    console.error('[sessions]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
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
    console.error('[sessions]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
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

    // Collect unique playbook_ids and escalation_ids to resolve titles
    const playbookIds = [...new Set((data || []).map((m) => m.playbook_id).filter(Boolean))]
    const escalationIds = [...new Set((data || []).map((m) => m.escalation_id).filter(Boolean))]

    const playbookMap = {}
    const escalationMap = {}

    if (playbookIds.length > 0) {
      const { data: pbs } = await req.supabase
        .from('playbooks')
        .select('id, title')
        .in('id', playbookIds)
      for (const pb of pbs || []) playbookMap[pb.id] = pb.title
    }

    if (escalationIds.length > 0) {
      const { data: ers } = await req.supabase
        .from('escalation_rules')
        .select('id, title')
        .in('id', escalationIds)
      for (const er of ers || []) escalationMap[er.id] = er.title
    }

    const messages = (data || []).map((m) => ({
      ...m,
      playbook_title: playbookMap[m.playbook_id] || null,
      escalation_title: escalationMap[m.escalation_id] || null,
    }))

    res.json({ messages })
  } catch (err) {
    console.error('[sessions]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

export default router
