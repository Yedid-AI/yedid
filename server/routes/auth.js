import { Router } from 'express'
import { checkAuth, checkRole } from '../middleware.js'

const router = Router()

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

    // Sign in via Supabase Auth (GoTrue)
    const { data: authData, error: authError } = await req.supabase.auth.signInWithPassword({ email, password })
    if (authError) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' })
    }

    // Lookup public.users for profile + role
    const { data: users, error: dbError } = await req.supabaseAdmin
      .from('users')
      .select('*')
      .eq('auth_id', authData.user.id)
      .limit(1)

    if (dbError) throw dbError
    if (!users || users.length === 0) {
      return res.status(401).json({ error: 'Utilisateur introuvable' })
    }

    const { password_hash, auth_id, ...safeUser } = users[0]
    await attachChatwootData(req.supabaseAdmin, safeUser)

    res.json({
      token: authData.session.access_token,
      refresh_token: authData.session.refresh_token,
      expires_at: authData.session.expires_at,
      user: safeUser,
    })
  } catch (err) {
    console.error('[auth]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
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

    const { password_hash, auth_id, ...safeUser } = users[0]
    await attachChatwootData(req.supabase, safeUser)

    res.json({ user: safeUser })
  } catch (err) {
    console.error('[auth]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// POST /api/register (super_admin + admin)
router.post('/register', checkAuth, checkRole('admin'), async (req, res) => {
  try {
    const { email, password, first_name, last_name, role, enterprise } = req.body
    if (!email || !password) {
      return res.status(400).json({ error: 'Email et mot de passe requis' })
    }

    const validRoles = ['super_admin', 'admin', 'agent', 'marketeur', 'branch']
    if (role && !validRoles.includes(role)) {
      return res.status(400).json({ error: 'Role invalide' })
    }
    // Admin cannot create super_admin users
    if (req.user.role === 'admin' && role === 'super_admin') {
      return res.status(403).json({ error: 'Impossible de creer un super_admin' })
    }
    // Company admin can only create users for their own enterprise
    const finalEnterprise = enterprise ? String(enterprise).toLowerCase() : null
    if (req.user.enterprise && finalEnterprise !== req.user.enterprise) {
      return res.status(403).json({ error: `Vous ne pouvez creer que des users ${req.user.enterprise}` })
    }

    // Create user in Supabase Auth (GoTrue)
    const { data: authData, error: authError } = await req.supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { first_name, last_name },
    })

    if (authError) {
      if (authError.message.includes('already been registered')) {
        return res.status(409).json({ error: 'Cet email existe deja' })
      }
      throw authError
    }

    // Create row in public.users with auth_id bridge
    const { data, error } = await req.supabaseAdmin
      .from('users')
      .insert({
        email,
        auth_id: authData.user.id,
        first_name: first_name || null,
        last_name: last_name || null,
        role: role || 'agent',
        enterprise: finalEnterprise,
      })
      .select()
      .single()

    if (error) {
      // Rollback: delete from auth.users if public.users insert fails
      await req.supabaseAdmin.auth.admin.deleteUser(authData.user.id)
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Cet email existe deja' })
      }
      throw error
    }

    const { password_hash, auth_id, ...safeUser } = data
    res.status(201).json({ user: safeUser })
  } catch (err) {
    console.error('[auth]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// GET /api/users (super_admin + admin)
router.get('/users', checkAuth, checkRole('admin'), async (req, res) => {
  try {
    const sb = req.supabaseAdmin || req.supabase
    let query = sb
      .from('users')
      .select('id, email, first_name, last_name, role, enterprise, created_at, chatwoot_accounts(account_id)')
      .order('created_at', { ascending: false })
    // Company admin only sees users of their own enterprise
    if (req.user.enterprise) query = query.eq('enterprise', req.user.enterprise)

    const { data, error } = await query
    if (error) throw error
    res.json({ users: data })
  } catch (err) {
    console.error('[auth]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// GET /api/users/:id (super_admin + admin — detail with chatwoot + stats)
router.get('/users/:id', checkAuth, checkRole('admin'), async (req, res) => {
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
    if (req.user.enterprise && user.enterprise !== req.user.enterprise) {
      return res.status(404).json({ error: 'Utilisateur introuvable' })
    }

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
    console.error('[auth]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// PUT /api/users/:id (super_admin + admin)
router.put('/users/:id', checkAuth, checkRole('admin'), async (req, res) => {
  try {
    const { id } = req.params
    const { first_name, last_name, role, enterprise, password } = req.body

    // Admin cannot promote to super_admin
    if (req.user.role === 'admin' && role === 'super_admin') {
      return res.status(403).json({ error: 'Impossible de definir le role super_admin' })
    }
    // Company admin scoping
    const finalEnterprise = enterprise !== undefined
      ? (enterprise ? String(enterprise).toLowerCase() : null)
      : undefined
    if (req.user.enterprise) {
      // Cannot edit user from another enterprise
      const { data: target } = await req.supabaseAdmin.from('users').select('enterprise').eq('id', id).maybeSingle()
      if (!target || target.enterprise !== req.user.enterprise) {
        return res.status(403).json({ error: 'Acces interdit' })
      }
      if (finalEnterprise !== undefined && finalEnterprise !== req.user.enterprise) {
        return res.status(403).json({ error: `Impossible de changer la societe` })
      }
    }

    // If password is being changed, update in Supabase Auth
    if (password) {
      const { data: targetUser } = await req.supabaseAdmin
        .from('users')
        .select('auth_id')
        .eq('id', id)
        .single()

      if (targetUser?.auth_id) {
        const { error: authErr } = await req.supabaseAdmin.auth.admin.updateUserById(
          targetUser.auth_id,
          { password }
        )
        if (authErr) throw authErr
      }
    }

    const updates = { updated_at: new Date().toISOString() }
    if (first_name !== undefined) updates.first_name = first_name
    if (last_name !== undefined) updates.last_name = last_name
    if (role !== undefined) updates.role = role
    if (finalEnterprise !== undefined) updates.enterprise = finalEnterprise

    const { data, error } = await req.supabaseAdmin
      .from('users')
      .update(updates)
      .eq('id', id)
      .select('id, email, first_name, last_name, role, enterprise, created_at')
      .single()

    if (error) throw error
    res.json({ user: data })
  } catch (err) {
    console.error('[auth]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// DELETE /api/users/:id (super_admin + admin)
router.delete('/users/:id', checkAuth, checkRole('admin'), async (req, res) => {
  try {
    const { id } = req.params
    if (parseInt(id) === req.user.user_id) {
      return res.status(400).json({ error: 'Impossible de supprimer votre propre compte' })
    }

    // Check if target is super_admin — block deletion
    const { data: targetUsers } = await req.supabaseAdmin
      .from('users')
      .select('role, auth_id, enterprise')
      .eq('id', id)
      .limit(1)

    if (targetUsers?.[0]?.role === 'super_admin') {
      return res.status(403).json({ error: 'Impossible de supprimer un super_admin' })
    }
    // Company admin can only delete users from their own enterprise
    if (req.user.enterprise && targetUsers?.[0]?.enterprise !== req.user.enterprise) {
      return res.status(403).json({ error: 'Acces interdit' })
    }

    // Delete from Supabase Auth first
    if (targetUsers?.[0]?.auth_id) {
      await req.supabaseAdmin.auth.admin.deleteUser(targetUsers[0].auth_id)
    }

    // Then delete from public.users
    const { error } = await req.supabaseAdmin
      .from('users')
      .delete()
      .eq('id', id)

    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    console.error('[auth]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// ─── User ↔ Branches (M:N for branch role) ───────────────

// GET /api/user-branches — all assignments (scoped by enterprise for company admins)
router.get('/user-branches', checkAuth, checkRole('admin'), async (req, res) => {
  try {
    let query = req.supabaseAdmin
      .from('user_branches')
      .select('id, user_id, branch_id, branches(id, name, user_id), users(id, email, first_name, last_name, enterprise)')
    const { data, error } = await query
    if (error) throw error
    // Filter to caller's enterprise when scoped
    const filtered = req.user.enterprise
      ? (data || []).filter(r => r.users?.enterprise === req.user.enterprise)
      : (data || [])
    res.json({ assignments: filtered })
  } catch (err) {
    console.error('[user-branches]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// GET /api/users/:id/branches — list branches assigned to a branch user
router.get('/users/:id/branches', checkAuth, checkRole('admin'), async (req, res) => {
  try {
    const { id } = req.params
    const { data, error } = await req.supabaseAdmin
      .from('user_branches')
      .select('id, branch_id, created_at, branches(id, name, user_id)')
      .eq('user_id', id)
      .order('created_at', { ascending: true })
    if (error) throw error
    res.json({ branches: data || [] })
  } catch (err) {
    console.error('[user-branches]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// POST /api/users/:id/branches — assign a branch to a user
router.post('/users/:id/branches', checkAuth, checkRole('admin'), async (req, res) => {
  try {
    const { id } = req.params
    const { branch_id } = req.body
    if (!branch_id) return res.status(400).json({ error: 'branch_id requis' })

    // Company admin can only assign branches that belong to their enterprise
    if (req.user.enterprise) {
      const { data: target } = await req.supabaseAdmin.from('users').select('enterprise').eq('id', id).maybeSingle()
      if (!target || target.enterprise !== req.user.enterprise) {
        return res.status(403).json({ error: 'Acces interdit' })
      }
      const { data: branch } = await req.supabaseAdmin.from('branches').select('user_id').eq('id', branch_id).maybeSingle()
      const { data: ownerRow } = await req.supabaseAdmin.from('users').select('id').eq('enterprise', req.user.enterprise).eq('role', 'admin').limit(1).maybeSingle()
      if (!branch || !ownerRow || branch.user_id !== ownerRow.id) {
        return res.status(403).json({ error: 'Branche hors de votre societe' })
      }
    }

    const { data, error } = await req.supabaseAdmin
      .from('user_branches')
      .upsert({ user_id: parseInt(id), branch_id: parseInt(branch_id) }, { onConflict: 'user_id,branch_id' })
      .select('id, branch_id, created_at')
      .single()
    if (error) throw error
    res.status(201).json({ assignment: data })
  } catch (err) {
    console.error('[user-branches]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// DELETE /api/users/:id/branches/:branchId — unassign
router.delete('/users/:id/branches/:branchId', checkAuth, checkRole('admin'), async (req, res) => {
  try {
    const { id, branchId } = req.params
    if (req.user.enterprise) {
      const { data: target } = await req.supabaseAdmin.from('users').select('enterprise').eq('id', id).maybeSingle()
      if (!target || target.enterprise !== req.user.enterprise) {
        return res.status(403).json({ error: 'Acces interdit' })
      }
    }
    const { error } = await req.supabaseAdmin
      .from('user_branches')
      .delete()
      .eq('user_id', id)
      .eq('branch_id', branchId)
    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    console.error('[user-branches]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// POST /api/heartbeat — presence ping + return active sessions
router.post('/heartbeat', checkAuth, async (req, res) => {
  try {
    const { session_id } = req.body
    if (!session_id) return res.status(400).json({ error: 'session_id requis' })

    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip
    const userAgent = req.headers['user-agent'] || ''

    // Upsert this session's heartbeat
    await req.supabaseAdmin
      .from('active_sessions')
      .upsert({
        id: session_id,
        user_id: req.user.user_id,
        last_seen: new Date().toISOString(),
        ip_address: ip,
        user_agent: userAgent,
      }, { onConflict: 'id' })

    // Clean up stale sessions (> 2 min) for this user
    const cutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString()
    await req.supabaseAdmin
      .from('active_sessions')
      .delete()
      .eq('user_id', req.user.user_id)
      .lt('last_seen', cutoff)

    // Return active sessions for this user
    const { data: sessions } = await req.supabaseAdmin
      .from('active_sessions')
      .select('id, last_seen, ip_address, user_agent')
      .eq('user_id', req.user.user_id)
      .gte('last_seen', cutoff)
      .order('last_seen', { ascending: false })

    res.json({ sessions: sessions || [] })
  } catch (err) {
    console.error('[heartbeat]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// POST /api/logout — clear server-side state (no-op for now, frontend handles token cleanup)
router.post('/logout', async (req, res) => {
  // Don't call supabase.auth.signOut() — it's a shared singleton and would
  // invalidate sessions for all users. Frontend clears localStorage which is sufficient.
  res.json({ success: true })
})

// POST /api/auth/refresh — refresh access token
router.post('/auth/refresh', async (req, res) => {
  try {
    const { refresh_token } = req.body
    if (!refresh_token) {
      return res.status(400).json({ error: 'refresh_token requis' })
    }

    const { data, error } = await req.supabase.auth.refreshSession({ refresh_token })
    if (error || !data.session) {
      return res.status(401).json({ error: 'Session expiree, reconnectez-vous' })
    }

    res.json({
      token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
    })
  } catch (err) {
    console.error('[auth]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

export default router
