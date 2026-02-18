import { Router } from 'express'
import { checkRole } from '../middleware.js'
import { CONFIGURABLE_KEYS, getSetting, upsertSettings, loadSettings } from '../settings.js'

const router = Router()

// GET /api/settings (super_admin only)
router.get('/settings', checkRole('super_admin'), async (req, res) => {
  try {
    const settings = {}
    for (const key of CONFIGURABLE_KEYS) {
      const value = getSetting(key)
      // Mask secrets: show only last 4 chars if set
      const isSecret = key.includes('KEY') || key.includes('TOKEN')
      settings[key] = {
        value: isSecret && value ? '••••' + value.slice(-4) : value,
        isSet: !!value,
        isSecret,
      }
    }
    res.json({ settings })
  } catch (err) {
    console.error('[settings]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// PUT /api/settings (super_admin only)
router.put('/settings', checkRole('super_admin'), async (req, res) => {
  try {
    const { settings } = req.body
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ error: 'Settings requis' })
    }

    const supabase = req.supabaseAdmin || req.supabase
    await upsertSettings(settings, supabase)

    // Restart closing cron if schedule/enabled settings changed
    const closingScheduleKeys = ['CLOSING_ENABLED', 'CLOSING_INTERVAL_MINUTES']
    if (Object.keys(settings).some((k) => closingScheduleKeys.includes(k))) {
      const { restartClosingCron } = await import('../engine/closing-cron.js')
      restartClosingCron(req.supabaseAdmin || req.supabase)
    }

    res.json({ success: true })
  } catch (err) {
    console.error('[settings]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// POST /api/settings/reload — force refresh settings cache from DB
router.post('/settings/reload', checkRole('super_admin'), async (req, res) => {
  try {
    const supabase = req.supabaseAdmin || req.supabase
    await loadSettings(supabase)
    res.json({ success: true })
  } catch (err) {
    console.error('[settings/reload]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

export default router
