import 'dotenv/config'
import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import { createClient } from '@supabase/supabase-js'
import path from 'path'
import { fileURLToPath } from 'url'
import { checkAuth, checkRole, checkApiKey } from './middleware.js'
import authRoutes from './routes/auth.js'
import sourcesRoutes from './routes/sources.js'
import playbooksRoutes from './routes/playbooks.js'
import toolsRoutes from './routes/tools.js'
import escalationRoutes from './routes/escalation.js'
import playbooksLibraryRoutes from './routes/playbooks-library.js'
import toolsLibraryRoutes from './routes/tools-library.js'
import escalationLibraryRoutes from './routes/escalation-library.js'
import agentRoutes from './routes/agent.js'
import whatsappRoutes from './routes/whatsapp.js'
import settingsRoutes from './routes/settings.js'
import agentBotsRoutes from './routes/agent-bots.js'
import inboxesRoutes from './routes/inboxes.js'
import sessionsRoutes from './routes/sessions.js'
import leadsRoutes from './routes/leads.js'
import branchesRoutes from './routes/branches.js'
import dispatchConfigRoutes from './routes/dispatch-config.js'
import callsRoutes from './routes/calls.js'
import publicLeadsRoutes from './routes/public-leads.js'
import followupConfigRoutes from './routes/followup-config.js'
import maskyooLinesRoutes from './routes/maskyoo-lines.js'
import { loadSettings } from './settings.js'
import { startClosingCron } from './engine/closing-cron.js'
import { startCallsCron } from './engine/calls-cron.js'
import { startFollowupCron } from './engine/followup-cron.js'

// --- Validate required env vars at startup ---
const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`FATAL: Missing required environment variable: ${key}`)
    process.exit(1)
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3001

// Supabase clients
const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_ANON_KEY
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null
const supabaseAdmin = supabaseUrl && supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey) : null

// Security headers
app.use(helmet({ contentSecurityPolicy: false }))

// CORS
app.use(cors({
  origin: process.env.FRONTEND_URL || true,
  credentials: true,
}))

// Rate limiting — login endpoint
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Trop de tentatives, reessayez plus tard' },
  standardHeaders: true,
  legacyHeaders: false,
})

// Rate limiting — webhook endpoint
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  message: { error: 'Rate limit exceeded' },
  standardHeaders: true,
  legacyHeaders: false,
})

// Rate limiting — public leads endpoint
const publicLeadsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Rate limit exceeded' },
  standardHeaders: true,
  legacyHeaders: false,
})

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

// Rate limiters on specific endpoints
app.use('/api/login', loginLimiter)
app.use('/api/webhook', webhookLimiter)
app.use('/api/public', publicLeadsLimiter)

// Public routes (no auth required)
app.use('/api', publicLeadsRoutes)

// API routes
app.use('/api', authRoutes)
app.use('/api', agentRoutes)  // API key auth routes — must be before checkAuth routes
app.use('/api', whatsappRoutes)  // Mixed auth — webhooks are public, /whatsapp/connect has its own checkAuth
app.use('/api', checkAuth, sourcesRoutes)
app.use('/api', checkAuth, playbooksLibraryRoutes)
app.use('/api', checkAuth, toolsLibraryRoutes)
app.use('/api', checkAuth, escalationLibraryRoutes)
app.use('/api', checkAuth, playbooksRoutes)
app.use('/api', checkAuth, toolsRoutes)
app.use('/api', checkAuth, escalationRoutes)
app.use('/api', checkAuth, settingsRoutes)
app.use('/api', checkAuth, agentBotsRoutes)
app.use('/api', checkAuth, inboxesRoutes)
app.use('/api', checkAuth, sessionsRoutes)
app.use('/api', checkAuth, leadsRoutes)
app.use('/api', checkAuth, branchesRoutes)
app.use('/api', checkAuth, dispatchConfigRoutes)
app.use('/api', checkAuth, callsRoutes)
app.use('/api', checkAuth, followupConfigRoutes)
app.use('/api', checkAuth, maskyooLinesRoutes)

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
  if (!supabase || !supabaseAdmin) return

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
    // Create user in Supabase Auth (GoTrue)
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (authError) {
      console.log('Seed admin auth error:', authError.message)
      return
    }

    // Create in public.users with auth_id bridge
    const { error: insertError } = await supabaseAdmin
      .from('users')
      .insert({
        email,
        auth_id: authData.user.id,
        first_name: 'Admin',
        role: 'super_admin',
      })

    if (insertError) {
      console.log('Seed admin error:', insertError.message)
      // Rollback auth user
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
    } else {
      console.log(`Seeded super_admin: ${email}`)
    }
  }
}

app.listen(PORT, async () => {
  console.log(`Yedid AI server running on port ${PORT}`)
  if (!supabase) {
    console.log('Warning: Supabase not configured.')
  }
  await loadSettings(supabase)
  await seedAdmin()
  startClosingCron(supabaseAdmin)
  startCallsCron(supabaseAdmin)
  startFollowupCron(supabaseAdmin)
})
