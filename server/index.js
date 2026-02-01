import 'dotenv/config'
import express from 'express'
import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcrypt'
import path from 'path'
import { fileURLToPath } from 'url'
import { checkAuth, checkRole, checkApiKey } from './middleware.js'
import authRoutes from './routes/auth.js'
import sourcesRoutes from './routes/sources.js'
import playbooksRoutes from './routes/playbooks.js'
import toolsRoutes from './routes/tools.js'
import escalationRoutes from './routes/escalation.js'
import agentRoutes from './routes/agent.js'
import settingsRoutes from './routes/settings.js'
import agentBotsRoutes from './routes/agent-bots.js'
import inboxesRoutes from './routes/inboxes.js'
import sessionsRoutes from './routes/sessions.js'
import { loadSettings } from './settings.js'
import { startClosingCron } from './engine/closing-cron.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3001

// Supabase clients
const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_ANON_KEY
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null
const supabaseAdmin = supabaseUrl && supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey) : null

// Middleware
app.use(express.json({ limit: '10mb' }))

// Attach supabase to request
app.use((req, res, next) => {
  req.supabase = supabase
  req.supabaseAdmin = supabaseAdmin
  next()
})

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' })
})

// API routes
app.use('/api', authRoutes)
app.use('/api', agentRoutes)  // API key auth routes — must be before checkAuth routes
app.use('/api', checkAuth, sourcesRoutes)
app.use('/api', checkAuth, playbooksRoutes)
app.use('/api', checkAuth, toolsRoutes)
app.use('/api', checkAuth, escalationRoutes)
app.use('/api', checkAuth, settingsRoutes)
app.use('/api', checkAuth, agentBotsRoutes)
app.use('/api', checkAuth, inboxesRoutes)
app.use('/api', checkAuth, sessionsRoutes)

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
  const distPath = path.resolve(__dirname, '../dist')
  app.use(express.static(distPath))
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

// Seed super_admin if users table is empty
async function seedAdmin() {
  if (!supabase) return

  const email = process.env.ADMIN_EMAIL
  const password = process.env.ADMIN_PASSWORD
  if (!email || !password) {
    console.log('Warning: ADMIN_EMAIL or ADMIN_PASSWORD not set. Skipping seed.')
    return
  }

  const { data: users, error } = await supabase
    .from('users')
    .select('id')
    .limit(1)

  if (error) {
    console.log('Users table check error:', error.message)
    return
  }

  if (users && users.length === 0) {
    const hash = await bcrypt.hash(password, 10)
    const { error: insertError } = await supabase
      .from('users')
      .insert({
        email,
        password_hash: hash,
        first_name: 'Admin',
        role: 'super_admin'
      })

    if (insertError) {
      console.log('Seed admin error:', insertError.message)
    } else {
      console.log(`Seeded super_admin: ${email}`)
    }
  }
}

app.listen(PORT, async () => {
  console.log(`Cardynal App server running on port ${PORT}`)
  if (!supabase) {
    console.log('Warning: Supabase not configured.')
  }
  await loadSettings(supabase)
  await seedAdmin()
  startClosingCron(supabaseAdmin)
})
