import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'cardynal-app-secret-change-in-production'

export function checkAuth(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Non autorise' })
  }

  const token = authHeader.split(' ')[1]
  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    req.user = decoded
    next()
  } catch (err) {
    return res.status(401).json({ error: 'Token invalide ou expire' })
  }
}

export function checkRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Acces interdit' })
    }
    next()
  }
}

export function verifyAgentOwner(req, res, next) {
  const agentBotId = req.params.agentBotId
  if (!agentBotId) {
    return res.status(400).json({ error: 'agentBotId requis' })
  }

  req.supabase
    .from('agent_bots')
    .select('id, user_id')
    .eq('id', agentBotId)
    .limit(1)
    .then(({ data, error }) => {
      if (error) return res.status(500).json({ error: error.message })
      if (!data || data.length === 0) {
        return res.status(404).json({ error: 'Agent introuvable' })
      }
      if (data[0].user_id !== req.user.user_id) {
        return res.status(403).json({ error: 'Acces interdit' })
      }
      req.agentBot = data[0]
      next()
    })
}

export function checkApiKey(req, res, next) {
  // Dynamic import to avoid circular deps at module load
  import('./settings.js').then(({ getSetting }) => {
    const apiKey = req.headers['x-api-key']
    const expectedKey = getSetting('AGENT_API_KEY')
    if (!expectedKey || apiKey !== expectedKey) {
      return res.status(401).json({ error: 'API key invalide' })
    }
    next()
  })
}
