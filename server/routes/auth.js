import { Router } from 'express'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { checkAuth, checkRole } from '../middleware.js'

const router = Router()
const JWT_SECRET = process.env.JWT_SECRET || 'cardynal-app-secret-change-in-production'

// Helper: attach chatwoot data to user object for frontend
async function attachChatwootData(supabase, user) {
  const { data: accounts } = await supabase
    .from('chatwoot_accounts')
    .select('account_id')
    .eq('user_id', user.id)
    .limit(1)
  if (accounts && accounts.length > 0) {
    user.chatwoot_account_id = accounts[0].account_id
    const { data: inboxes } = await supabase
      .from('inboxes')
      .select('website_token')
      .eq('user_id', user.id)
      .limit(1)
    if (inboxes && inboxes.length > 0) {
      user.chatwoot_website_token = inboxes[0].website_token
    }
  }
}

// POST /api/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) {
      return res.status(400).json({ error: 'Email et mot de passe requis' })
    }

    const { data: users, error } = await req.supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .limit(1)

    if (error) throw error
    if (!users || users.length === 0) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' })
    }

    const user = users[0]
    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' })
    }

    const token = jwt.sign(
      { user_id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    )

    const { password_hash, ...safeUser } = user
    await attachChatwootData(req.supabase, safeUser)

    res.json({ token, user: safeUser })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/verify
router.get('/verify', checkAuth, async (req, res) => {
  try {
    const { data: users, error } = await req.supabase
      .from('users')
      .select('*')
      .eq('id', req.user.user_id)
      .limit(1)

    if (error) throw error
    if (!users || users.length === 0) {
      return res.status(401).json({ error: 'Utilisateur introuvable' })
    }

    const { password_hash, ...safeUser } = users[0]
    await attachChatwootData(req.supabase, safeUser)

    res.json({ user: safeUser })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/register (super_admin only)
router.post('/register', checkAuth, checkRole('super_admin'), async (req, res) => {
  try {
    const { email, password, first_name, last_name, role, enterprise } = req.body
    if (!email || !password) {
      return res.status(400).json({ error: 'Email et mot de passe requis' })
    }

    const validRoles = ['super_admin', 'admin', 'agent']
    if (role && !validRoles.includes(role)) {
      return res.status(400).json({ error: 'Role invalide' })
    }

    const hash = await bcrypt.hash(password, 10)
    const { data, error } = await req.supabase
      .from('users')
      .insert({
        email,
        password_hash: hash,
        first_name: first_name || null,
        last_name: last_name || null,
        role: role || 'agent',
        enterprise: enterprise || null,
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Cet email existe deja' })
      }
      throw error
    }

    const { password_hash, ...safeUser } = data
    res.status(201).json({ user: safeUser })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/users (super_admin only)
router.get('/users', checkAuth, checkRole('super_admin'), async (req, res) => {
  try {
    const { data, error } = await req.supabase
      .from('users')
      .select('id, email, first_name, last_name, role, enterprise, created_at, chatwoot_accounts(account_id)')
      .order('created_at', { ascending: false })

    if (error) throw error
    res.json({ users: data })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/users/:id (super_admin only — detail with chatwoot + stats)
router.get('/users/:id', checkAuth, checkRole('super_admin'), async (req, res) => {
  try {
    const { id } = req.params

    // Fetch user
    const { data: users, error: userError } = await req.supabase
      .from('users')
      .select('id, email, first_name, last_name, role, enterprise, created_at, updated_at')
      .eq('id', id)
      .limit(1)

    if (userError) throw userError
    if (!users || users.length === 0) {
      return res.status(404).json({ error: 'Utilisateur introuvable' })
    }

    const user = users[0]

    // Fetch chatwoot_account
    const { data: chatwootAccounts } = await req.supabase
      .from('chatwoot_accounts')
      .select('*')
      .eq('user_id', id)
      .limit(1)

    // Fetch inboxes
    const { data: inboxes } = await req.supabase
      .from('inboxes')
      .select('*')
      .eq('user_id', id)
      .order('created_at', { ascending: false })

    // Fetch agent_bots
    const { data: agentBots } = await req.supabase
      .from('agent_bots')
      .select('id, name, is_active')
      .eq('user_id', id)
      .order('created_at', { ascending: false })

    // Fetch stats counts in parallel
    const [sourcesRes, agentBotsRes, inboxesRes, sessionsRes] = await Promise.all([
      req.supabase.from('sources').select('id', { count: 'exact', head: true }).eq('user_id', id),
      req.supabase.from('agent_bots').select('id', { count: 'exact', head: true }).eq('user_id', id),
      req.supabase.from('inboxes').select('id', { count: 'exact', head: true }).eq('user_id', id),
      req.supabase.from('sessions').select('id', { count: 'exact', head: true }).eq('user_id', id),
    ])

    res.json({
      user,
      chatwoot_account: chatwootAccounts?.[0] || null,
      inboxes: inboxes || [],
      agent_bots: agentBots || [],
      stats: {
        sources: sourcesRes.count || 0,
        agents: agentBotsRes.count || 0,
        inboxes: inboxesRes.count || 0,
        sessions: sessionsRes.count || 0,
      },
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PUT /api/users/:id (super_admin only)
router.put('/users/:id', checkAuth, checkRole('super_admin'), async (req, res) => {
  try {
    const { id } = req.params
    const { first_name, last_name, role, enterprise, password } = req.body

    const updates = { updated_at: new Date().toISOString() }
    if (first_name !== undefined) updates.first_name = first_name
    if (last_name !== undefined) updates.last_name = last_name
    if (role !== undefined) updates.role = role
    if (enterprise !== undefined) updates.enterprise = enterprise
    if (password) updates.password_hash = await bcrypt.hash(password, 10)

    const { data, error } = await req.supabase
      .from('users')
      .update(updates)
      .eq('id', id)
      .select('id, email, first_name, last_name, role, enterprise, created_at')
      .single()

    if (error) throw error
    res.json({ user: data })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/users/:id (super_admin only)
router.delete('/users/:id', checkAuth, checkRole('super_admin'), async (req, res) => {
  try {
    const { id } = req.params
    if (parseInt(id) === req.user.user_id) {
      return res.status(400).json({ error: 'Impossible de supprimer votre propre compte' })
    }

    // Check if target is super_admin — block deletion
    const { data: targetUsers } = await req.supabase
      .from('users')
      .select('role')
      .eq('id', id)
      .limit(1)

    if (targetUsers?.[0]?.role === 'super_admin') {
      return res.status(403).json({ error: 'Impossible de supprimer un super_admin' })
    }

    const { error } = await req.supabase
      .from('users')
      .delete()
      .eq('id', id)

    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
