import crypto from 'crypto'

export async function checkAuth(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Non autorise' })
  }

  const token = authHeader.split(' ')[1]
  try {
    // Verify Supabase Auth token via GoTrue
    const { data: { user: authUser }, error } = await req.supabaseAdmin.auth.getUser(token)
    if (error || !authUser) {
      return res.status(401).json({ error: 'Token invalide ou expire' })
    }

    // Lookup public.users by auth_id to get BIGINT user_id + role
    const { data: users, error: dbError } = await req.supabaseAdmin
      .from('users')
      .select('id, email, role, capture_token')
      .eq('auth_id', authUser.id)
      .limit(1)

    if (dbError || !users || users.length === 0) {
      return res.status(401).json({ error: 'Utilisateur introuvable' })
    }

    // Same shape as before: { user_id, email, role }
    req.user = {
      user_id: users[0].id,
      email: users[0].email,
      role: users[0].role,
      capture_token: users[0].capture_token || null,
    }
    next()
  } catch (err) {
    return res.status(401).json({ error: 'Token invalide ou expire' })
  }
}

export function checkRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(403).json({ error: 'Acces interdit' })
    // super_admin inherits all permissions
    const hasAccess = roles.includes(req.user.role) ||
      (req.user.role === 'super_admin')
    if (!hasAccess) return res.status(403).json({ error: 'Acces interdit' })
    next()
  }
}

export async function verifyAgentOwner(req, res, next) {
  const agentBotId = req.params.agentBotId || req.params.id
  if (!agentBotId) {
    return res.status(400).json({ error: 'agentBotId requis' })
  }

  try {
    const { data, error } = await req.supabase
      .from('agent_bots')
      .select('id, user_id')
      .eq('id', agentBotId)
      .limit(1)

    if (error) return res.status(500).json({ error: 'Erreur interne' })
    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Agent introuvable' })
    }
    if (data[0].user_id !== req.user.user_id) {
      return res.status(403).json({ error: 'Acces interdit' })
    }
    req.agentBot = data[0]
    next()
  } catch (err) {
    return res.status(500).json({ error: 'Erreur interne' })
  }
}

export function checkApiKey(req, res, next) {
  import('./settings.js').then(({ getSetting }) => {
    const apiKey = req.headers['x-api-key']
    const expectedKey = getSetting('AGENT_API_KEY')
    if (!expectedKey || apiKey !== expectedKey) {
      return res.status(401).json({ error: 'API key invalide' })
    }
    next()
  }).catch(() => {
    return res.status(500).json({ error: 'Erreur interne' })
  })
}

/**
 * Verify webhook secret — compares x-webhook-secret header using timing-safe comparison.
 */
export function checkWebhookSecret(req, res, next) {
  import('./settings.js').then(({ getSetting }) => {
    const secret = getSetting('WEBHOOK_SECRET')
    // If no secret configured, allow (backwards compat) but warn
    if (!secret) {
      console.warn('[Security] WEBHOOK_SECRET not set — webhook endpoint is unprotected')
      return next()
    }
    const provided = req.headers['x-webhook-secret'] || ''
    if (!provided || !timingSafeEqual(secret, provided)) {
      return res.status(401).json({ error: 'Webhook secret invalide' })
    }
    next()
  }).catch(() => {
    return res.status(500).json({ error: 'Erreur interne' })
  })
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
}
