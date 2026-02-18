import { Router } from 'express'
import { checkRole } from '../middleware.js'

const router = Router()

/**
 * Helper: get all agent_bot IDs owned by current user.
 */
async function getUserBotIds(supabase, userId) {
  const { data } = await supabase
    .from('agent_bots')
    .select('id')
    .eq('user_id', userId)
  return (data || []).map(b => b.id)
}

// GET /api/playbooks — list all playbooks for current user (via agent_bots ownership)
router.get('/playbooks', checkRole('admin'), async (req, res) => {
  try {
    const botIds = await getUserBotIds(req.supabaseAdmin, req.user.user_id)
    if (botIds.length === 0) return res.json({ playbooks: [] })

    const { data, error } = await req.supabaseAdmin
      .from('playbooks')
      .select('*, tools(id, name)')
      .in('agent_bot_id', botIds)
      .order('created_at', { ascending: false })

    if (error) throw error

    // Compute per-playbook session stats
    const pbIds = data.map((pb) => pb.id)
    let statsMap = {}
    if (pbIds.length > 0) {
      const { data: msgs } = await req.supabaseAdmin
        .from('conversation_messages')
        .select('playbook_id, session_id, sessions(billable, ai_reason)')
        .eq('user_id', req.user.user_id)
        .in('playbook_id', pbIds)

      const buckets = {}
      for (const m of msgs || []) {
        if (!buckets[m.playbook_id]) buckets[m.playbook_id] = { sessions: new Set(), resolved: new Set() }
        buckets[m.playbook_id].sessions.add(m.session_id)
        if (m.sessions?.billable && !m.sessions?.ai_reason?.startsWith('ESCALATION:')) {
          buckets[m.playbook_id].resolved.add(m.session_id)
        }
      }
      for (const [id, b] of Object.entries(buckets)) {
        const total = b.sessions.size
        const resolved = b.resolved.size
        statsMap[id] = { total_sessions: total, resolved_sessions: resolved, resolution_rate: total > 0 ? Math.round(resolved / total * 100) : null }
      }
    }

    const playbooks = data.map((pb) => ({ ...pb, stats: statsMap[pb.id] || { total_sessions: 0, resolved_sessions: 0, resolution_rate: null } }))
    res.json({ playbooks })
  } catch (err) {
    console.error('[playbooks-library]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// POST /api/playbooks — create playbook (auto-assigns to user's first agent_bot)
router.post('/playbooks', checkRole('admin'), async (req, res) => {
  try {
    const { title, content, audience, rules, tool_id, is_active, emoji } = req.body
    if (!title || !content) {
      return res.status(400).json({ error: 'Titre et contenu requis' })
    }

    // Auto-assign to user's first agent_bot
    const botIds = await getUserBotIds(req.supabaseAdmin, req.user.user_id)
    const agentBotId = req.body.agent_bot_id || botIds[0] || null

    const { data, error } = await req.supabaseAdmin
      .from('playbooks')
      .insert({
        agent_bot_id: agentBotId,
        title,
        content,
        audience: audience || null,
        rules: rules || null,
        tool_id: tool_id || null,
        is_active: is_active !== undefined ? is_active : true,
        emoji: emoji || null,
      })
      .select('*, tools(id, name)')
      .single()

    if (error) throw error
    res.status(201).json({ playbook: data })
  } catch (err) {
    console.error('[playbooks-library]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// PUT /api/playbooks/:id — update playbook
router.put('/playbooks/:id', checkRole('admin'), async (req, res) => {
  try {
    const { id } = req.params
    const { title, content, audience, rules, tool_id, is_active, emoji } = req.body

    // Verify ownership via agent_bots
    const botIds = await getUserBotIds(req.supabaseAdmin, req.user.user_id)
    if (botIds.length === 0) return res.status(404).json({ error: 'Playbook introuvable' })

    const updates = { updated_at: new Date().toISOString() }
    if (title !== undefined) updates.title = title
    if (content !== undefined) updates.content = content
    if (audience !== undefined) updates.audience = audience
    if (rules !== undefined) updates.rules = rules
    if (tool_id !== undefined) updates.tool_id = tool_id
    if (is_active !== undefined) updates.is_active = is_active
    if (emoji !== undefined) updates.emoji = emoji || null

    const { data, error } = await req.supabaseAdmin
      .from('playbooks')
      .update(updates)
      .eq('id', id)
      .in('agent_bot_id', botIds)
      .select('*, tools(id, name)')
      .single()

    if (error) throw error
    if (!data) return res.status(404).json({ error: 'Playbook introuvable' })
    res.json({ playbook: data })
  } catch (err) {
    console.error('[playbooks-library]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// DELETE /api/playbooks/:id — delete playbook
router.delete('/playbooks/:id', checkRole('admin'), async (req, res) => {
  try {
    const { id } = req.params
    const botIds = await getUserBotIds(req.supabaseAdmin, req.user.user_id)
    if (botIds.length === 0) return res.status(404).json({ error: 'Playbook introuvable' })

    const { error } = await req.supabaseAdmin
      .from('playbooks')
      .delete()
      .eq('id', id)
      .in('agent_bot_id', botIds)

    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    console.error('[playbooks-library]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

export default router
