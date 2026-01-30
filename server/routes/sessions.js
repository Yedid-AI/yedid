import { Router } from 'express'
import { checkRole } from '../middleware.js'

const router = Router()

// GET /api/sessions?inbox_id=X
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

    const { data, error } = await query

    if (error) throw error
    res.json({ sessions: data })
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
