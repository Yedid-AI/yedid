import { Router } from 'express'
import { checkRole } from '../middleware.js'
import { createHostedAuthLink } from '../unipile.js'
import { getSetting } from '../settings.js'

const router = Router()

const DEFAULT_CONFIG = {
  message_fields: ['company', 'name', 'phone', 'email', 'city', 'service_requested', 'service_type', 'details', 'source'],
  message_header: '',
  message_footer: '',
  schedule_days: [0, 1, 2, 3, 4, 5, 6],
  schedule_hour_start: 8,
  schedule_hour_end: 20,
  auto_dispatch: false,
  dispatch_inbox_id: null,
}

// GET /api/dispatch-config
router.get('/dispatch-config', checkRole('admin'), async (req, res) => {
  try {
    const userId = req.user.user_id

    const supabase = req.supabaseAdmin || req.supabase
    const { data, error } = await supabase
      .from('dispatch_config')
      .select('*, inboxes:dispatch_inbox_id(id, name, phone_number, unipile_account_id)')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle()

    if (error) throw error

    // Return config or defaults
    res.json({ config: data || { ...DEFAULT_CONFIG, user_id: userId } })
  } catch (err) {
    console.error('[dispatch-config]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// PUT /api/dispatch-config
router.put('/dispatch-config', checkRole('admin'), async (req, res) => {
  try {
    const userId = req.user.user_id
    const allowed = [
      'message_fields', 'message_header', 'message_footer',
      'schedule_days', 'schedule_hour_start', 'schedule_hour_end',
      'auto_dispatch', 'dispatch_inbox_id',
    ]

    const updates = { user_id: userId, updated_at: new Date().toISOString() }
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key]
    }

    const supabase = req.supabaseAdmin || req.supabase
    const { data, error } = await supabase
      .from('dispatch_config')
      .upsert(updates, { onConflict: 'user_id' })
      .select('*, inboxes:dispatch_inbox_id(id, name, phone_number, unipile_account_id)')
      .single()

    if (error) throw error
    res.json({ config: data })
  } catch (err) {
    console.error('[dispatch-config]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// POST /api/dispatch-config/connect-whatsapp — hosted auth for dispatch-dedicated WhatsApp
router.post('/dispatch-config/connect-whatsapp', checkRole('admin'), async (req, res) => {
  try {
    const appBaseUrl = getSetting('APP_BASE_URL')
    if (!appBaseUrl) return res.status(400).json({ error: 'APP_BASE_URL non configure' })

    const result = await createHostedAuthLink({
      callbackUrl: `${appBaseUrl}/branches?dispatch=connected`,
      notifyUrl: `${appBaseUrl}/api/webhook/unipile/account`,
      name: `dispatch-${req.user.user_id}`,
    })

    res.json({ url: result.url })
  } catch (err) {
    console.error('[dispatch-config/connect-whatsapp]', err.message)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/dispatch-config/reconnect-whatsapp — reconnect existing dispatch WhatsApp
router.post('/dispatch-config/reconnect-whatsapp', checkRole('admin'), async (req, res) => {
  try {
    const userId = req.user.user_id
    const supabase = req.supabaseAdmin || req.supabase

    // Get dispatch config + linked inbox
    const { data: config } = await supabase
      .from('dispatch_config')
      .select('dispatch_inbox_id, inboxes:dispatch_inbox_id(unipile_account_id)')
      .eq('user_id', userId)
      .maybeSingle()

    const unipileAccountId = config?.inboxes?.unipile_account_id
    if (!unipileAccountId) return res.status(400).json({ error: 'Pas de compte dispatch WhatsApp a reconnecter' })

    const appBaseUrl = getSetting('APP_BASE_URL')
    if (!appBaseUrl) return res.status(400).json({ error: 'APP_BASE_URL non configure' })

    const result = await createHostedAuthLink({
      callbackUrl: `${appBaseUrl}/branches?dispatch=reconnected`,
      notifyUrl: `${appBaseUrl}/api/webhook/unipile/account`,
      name: `dispatch-${userId}`,
      reconnectAccountId: unipileAccountId,
    })

    res.json({ url: result.url })
  } catch (err) {
    console.error('[dispatch-config/reconnect-whatsapp]', err.message)
    res.status(500).json({ error: err.message })
  }
})

export default router
