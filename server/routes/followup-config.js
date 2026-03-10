import { Router } from 'express'
import { checkRole } from '../middleware.js'
import { createHostedAuthLink } from '../unipile.js'
import { getSetting } from '../settings.js'

const router = Router()

// GET /api/followup-config
router.get('/followup-config', checkRole('admin'), async (req, res) => {
  try {
    const userId = req.user.user_id

    const { data, error } = await req.supabase
      .from('followup_config')
      .select('*')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle()

    if (error) throw error

    res.json({
      config: data || {
        user_id: userId,
        is_active: false,
        delay_minutes: 3,
        message_template: '',
        sources: [],
      },
    })
  } catch (err) {
    console.error('[followup-config]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// PUT /api/followup-config
router.put('/followup-config', checkRole('admin'), async (req, res) => {
  try {
    const userId = req.user.user_id
    const allowed = [
      'is_active', 'agent_bot_id', 'delay_minutes',
      'message_template', 'sources',
    ]

    const updates = { user_id: userId, updated_at: new Date().toISOString() }
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key]
    }

    const { data, error } = await req.supabase
      .from('followup_config')
      .upsert(updates, { onConflict: 'user_id' })
      .select()
      .single()

    if (error) throw error
    res.json({ config: data })
  } catch (err) {
    console.error('[followup-config]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// POST /api/followup-config/connect-whatsapp
router.post('/followup-config/connect-whatsapp', checkRole('admin'), async (req, res) => {
  try {
    const appBaseUrl = getSetting('APP_BASE_URL')
    if (!appBaseUrl) return res.status(400).json({ error: 'APP_BASE_URL non configure' })

    const result = await createHostedAuthLink({
      callbackUrl: `${appBaseUrl}/calls?followup=connected`,
      notifyUrl: `${appBaseUrl}/api/webhook/unipile/account`,
      name: `followup-${req.user.user_id}`,
    })

    res.json({ url: result.url })
  } catch (err) {
    console.error('[followup-config/connect-whatsapp]', err.message)
    res.status(500).json({ error: err.message })
  }
})

// GET /api/followup-config/whatsapp-status
router.get('/followup-config/whatsapp-status', checkRole('admin'), async (req, res) => {
  try {
    const userId = req.user.user_id
    const { data } = await req.supabase
      .from('followup_config')
      .select('whatsapp_account_id, whatsapp_connected')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle()

    res.json({
      connected: data?.whatsapp_connected || false,
      account_id: data?.whatsapp_account_id || null,
    })
  } catch (err) {
    console.error('[followup-config/whatsapp-status]', err.message)
    res.status(500).json({ error: err.message })
  }
})

// GET /api/followup-config/sources — distinct Maskyoo sources from calls table
router.get('/followup-config/sources', checkRole('admin'), async (req, res) => {
  try {
    const { data, error } = await req.supabaseAdmin
      .from('calls')
      .select('user_name, cdr_ddi')

    if (error) throw error

    // Deduplicate by user_name + cdr_ddi
    const seen = new Set()
    const sources = []
    for (const row of (data || [])) {
      if (!row.user_name && !row.cdr_ddi) continue
      const key = `${row.user_name || ''}|${row.cdr_ddi || ''}`
      if (seen.has(key)) continue
      seen.add(key)
      sources.push({
        user_name: row.user_name || null,
        cdr_ddi: row.cdr_ddi || null,
      })
    }

    sources.sort((a, b) => (a.user_name || '').localeCompare(b.user_name || ''))

    res.json({ sources })
  } catch (err) {
    console.error('[followup-config/sources]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// GET /api/followup-config/stats — health & stats for the followup system
router.get('/followup-config/stats', checkRole('admin'), async (req, res) => {
  try {
    const userId = req.user.user_id
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    // Counts by status (today)
    const { data: todayStats } = await req.supabaseAdmin
      .from('followup_queue')
      .select('status')
      .eq('user_id', userId)
      .gte('created_at', todayStart.toISOString())

    const counts = { sent: 0, pending: 0, skipped: 0, failed: 0 }
    for (const row of (todayStats || [])) {
      if (counts[row.status] !== undefined) counts[row.status]++
    }

    // Last sent
    const { data: lastSent } = await req.supabaseAdmin
      .from('followup_queue')
      .select('phone, processed_at')
      .eq('user_id', userId)
      .eq('status', 'sent')
      .order('processed_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // Currently pending (not just today)
    const { count: pendingTotal } = await req.supabaseAdmin
      .from('followup_queue')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'pending')

    res.json({
      today: counts,
      pending_total: pendingTotal || 0,
      last_sent_at: lastSent?.processed_at || null,
      last_sent_phone: lastSent?.phone || null,
    })
  } catch (err) {
    console.error('[followup-config/stats]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// GET /api/followup-config/queue — recent queue entries
router.get('/followup-config/queue', checkRole('admin'), async (req, res) => {
  try {
    const userId = req.user.user_id
    const { data, error } = await req.supabaseAdmin
      .from('followup_queue')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) throw error
    res.json({ queue: data || [] })
  } catch (err) {
    console.error('[followup-config/queue]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

export default router
