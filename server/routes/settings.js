import { Router } from 'express'
import { checkRole } from '../middleware.js'
import { CONFIGURABLE_KEYS, getSetting, upsertSettings } from '../settings.js'

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
    res.status(500).json({ error: err.message })
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

    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
