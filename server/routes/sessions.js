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

    // Apply date range filter (affects stats + table)
    let dateFiltered = allData
    if (req.query.date_from) {
      const from = new Date(req.query.date_from)
      dateFiltered = dateFiltered.filter((s) => new Date(s.created_at) >= from)
    }
    if (req.query.date_to) {
      const to = new Date(req.query.date_to)
      dateFiltered = dateFiltered.filter((s) => new Date(s.created_at) <= to)
    }

    // Fetch all assistant messages for stats (total AI messages + first response times)
    const allSessionIds = dateFiltered.map((s) => s.id)
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
    const sessionById = Object.fromEntries(dateFiltered.map((s) => [s.id, s]))
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
    const resolved = dateFiltered.filter((s) => s.billable).length
    const stats = {
      total: dateFiltered.length,
      total_ai_messages: assistantMsgs.length,
      resolved,
      escalated: dateFiltered.filter((s) => s.ai_reason?.startsWith('ESCALATION:')).length,
      resolution_rate: allData.length > 0 ? +(resolved / allData.length * 100).toFixed(0) : null,
      avg_first_response: responseTimes.length > 0
        ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
        : null,
    }

    // Apply filters for table view
    let filtered = dateFiltered
    if (req.query.inbox_id) {
      filtered = filtered.filter((s) => String(s.chatwoot_inbox_id) === req.query.inbox_id)
    }
    if (req.query.status) {
      const st = req.query.status
      if (st === 'escalated') {
        filtered = filtered.filter((s) => s.ai_reason?.startsWith('ESCALATION:'))
      } else if (st === 'resolved') {
        filtered = filtered.filter((s) => s.billable && !s.ai_reason?.startsWith('ESCALATION:'))
      } else if (st === 'closed') {
        filtered = filtered.filter((s) => s.status === 'closed' && !s.billable && !s.ai_reason?.startsWith('ESCALATION:'))
      } else {
        filtered = filtered.filter((s) => s.status === st)
      }
    }

    // Fetch messages for visible sessions (counts + dominant playbook)
    const sessionIds = filtered.map((s) => s.id)
    const countMap = {}
    const playbookCountMap = {}
    if (sessionIds.length > 0) {
      const { data: msgs } = await req.supabase
        .from('conversation_messages')
        .select('session_id, playbook_id')
        .in('session_id', sessionIds)
        .limit(50000)
      for (const m of msgs || []) {
        countMap[m.session_id] = (countMap[m.session_id] || 0) + 1
        if (m.playbook_id) {
          if (!playbookCountMap[m.session_id]) playbookCountMap[m.session_id] = {}
          playbookCountMap[m.session_id][m.playbook_id] = (playbookCountMap[m.session_id][m.playbook_id] || 0) + 1
        }
      }
    }

    // Resolve dominant playbook per session
    const dominantPbMap = {}
    for (const [sid, counts] of Object.entries(playbookCountMap)) {
      let maxCount = 0, maxId = null
      for (const [pbId, count] of Object.entries(counts)) {
        if (count > maxCount) { maxCount = count; maxId = pbId }
      }
      dominantPbMap[sid] = maxId
    }
    const pbIds = [...new Set(Object.values(dominantPbMap).filter(Boolean))]
    const pbTitleMap = {}
    if (pbIds.length > 0) {
      const { data: pbs } = await req.supabase.from('playbooks').select('id, title').in('id', pbIds)
      for (const pb of pbs || []) pbTitleMap[pb.id] = pb.title
    }

    // Enrich filtered sessions
    const sessions = filtered.map((s) => ({
      ...s,
      message_count: countMap[s.id] || 0,
      dominant_playbook: pbTitleMap[dominantPbMap[s.id]] || null,
      duration_seconds: s.closed_at
        ? Math.round((new Date(s.closed_at) - new Date(s.created_at)) / 1000)
        : null,
    }))

    // Build chart data — daily breakdown from filtered sessions
    const chartMap = {}
    const filteredIdSet = new Set(filtered.map((s) => s.id))
    for (const s of filtered) {
      const day = s.created_at.slice(0, 10)
      if (!chartMap[day]) chartMap[day] = { date: day, sessions: 0, resolved: 0, escalated: 0, ai_messages: 0 }
      chartMap[day].sessions++
      const isEsc = s.ai_reason?.startsWith('ESCALATION:')
      if (isEsc) chartMap[day].escalated++
      else if (s.billable) chartMap[day].resolved++
    }
    for (const msg of assistantMsgs) {
      if (filteredIdSet.has(msg.session_id)) {
        const day = msg.created_at.slice(0, 10)
        if (chartMap[day]) chartMap[day].ai_messages++
      }
    }
    const chart = Object.values(chartMap).sort((a, b) => a.date.localeCompare(b.date))

    res.json({ sessions, stats, chart })
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
