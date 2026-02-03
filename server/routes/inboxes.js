import { Router } from 'express'
import { checkRole } from '../middleware.js'
import { createInbox, getInbox, updateInbox, updateInboxAvatar, attachBotToInbox, addInboxMember, accountApi } from '../chatwoot.js'
import multer from 'multer'

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } })
import { getSetting } from '../settings.js'

const router = Router()

// GET /api/inboxes
router.get('/inboxes', checkRole('admin'), async (req, res) => {
  try {
    const { data, error } = await req.supabase
      .from('inboxes')
      .select('*, agent_bots(id, name)')
      .eq('user_id', req.user.user_id)
      .order('created_at', { ascending: false })

    if (error) throw error

    // Fetch session counts per inbox (grouped by chatwoot_inbox_id)
    const inboxIds = data.map((i) => i.inbox_id).filter(Boolean)
    const sessionCountMap = {}
    const resolvedCountMap = {}
    if (inboxIds.length > 0) {
      const { data: sessions } = await req.supabase
        .from('sessions')
        .select('chatwoot_inbox_id, billable')
        .eq('user_id', req.user.user_id)
        .in('chatwoot_inbox_id', inboxIds)
      for (const s of sessions || []) {
        sessionCountMap[s.chatwoot_inbox_id] = (sessionCountMap[s.chatwoot_inbox_id] || 0) + 1
        if (s.billable) {
          resolvedCountMap[s.chatwoot_inbox_id] = (resolvedCountMap[s.chatwoot_inbox_id] || 0) + 1
        }
      }
    }

    const inboxes = data.map((i) => ({
      ...i,
      session_count: sessionCountMap[i.inbox_id] || 0,
      resolved_count: resolvedCountMap[i.inbox_id] || 0,
      channel_type: i.channel_type || 'web',
    }))

    res.json({ inboxes })
  } catch (err) {
    console.error('[inboxes]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// GET /api/inboxes/:id
router.get('/inboxes/:id', checkRole('admin'), async (req, res) => {
  try {
    const { id } = req.params
    const { data, error } = await req.supabase
      .from('inboxes')
      .select('*, agent_bots(id, name)')
      .eq('id', id)
      .eq('user_id', req.user.user_id)
      .single()

    if (error) throw error
    if (!data) return res.status(404).json({ error: 'Inbox introuvable' })
    res.json({ inbox: data })
  } catch (err) {
    console.error('[inboxes]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// POST /api/inboxes
router.post('/inboxes', checkRole('admin'), async (req, res) => {
  try {
    const { name, website_url, welcome_title, welcome_tagline, widget_color } = req.body
    if (!name) {
      return res.status(400).json({ error: 'Nom requis' })
    }

    // Get user's chatwoot account (with access_token for API calls)
    const { data: accounts } = await req.supabase
      .from('chatwoot_accounts')
      .select('account_id, chatwoot_user_id, access_token')
      .eq('user_id', req.user.user_id)
      .limit(1)

    if (!accounts || accounts.length === 0) {
      return res.status(400).json({ error: 'Compte Chatwoot requis. Contactez l\'administrateur.' })
    }

    const accountId = accounts[0].account_id
    const chatUserId = accounts[0].chatwoot_user_id
    const userToken = accounts[0].access_token

    // Build channel options
    const channelOpts = {
      name,
      websiteUrl: website_url || 'https://cardynal.io',
      welcomeTitle: welcome_title || `Bienvenue chez ${name}`,
      welcomeTagline: welcome_tagline || 'Comment puis-je vous aider ?',
    }
    if (widget_color) channelOpts.widgetColor = widget_color

    // Create inbox on Chatwoot (using user's own token)
    const inbox = await createInbox(accountId, channelOpts, userToken)

    // Wait briefly for propagation
    await new Promise((r) => setTimeout(r, 2000))

    // Add user as inbox member
    if (chatUserId) {
      try {
        await addInboxMember(accountId, inbox.id, chatUserId, userToken)
      } catch (e) {
        console.log('addInboxMember skipped:', e.message)
      }
    }

    // Insert in DB
    const supabase = req.supabaseAdmin || req.supabase
    const { data, error } = await supabase
      .from('inboxes')
      .insert({
        user_id: req.user.user_id,
        chatwoot_account_id: accountId,
        inbox_id: inbox.id,
        website_token: inbox.website_token,
        name,
      })
      .select('*, agent_bots(id, name)')
      .single()

    if (error) throw error
    res.status(201).json({ inbox: data })
  } catch (err) {
    console.error('[inboxes]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// PUT /api/inboxes/:id/assign-agent
router.put('/inboxes/:id/assign-agent', checkRole('admin'), async (req, res) => {
  try {
    const { id } = req.params
    const { agent_bot_id } = req.body

    // Verify inbox ownership
    const { data: inbox } = await req.supabase
      .from('inboxes')
      .select('id, inbox_id, chatwoot_account_id')
      .eq('id', id)
      .eq('user_id', req.user.user_id)
      .single()

    if (!inbox) return res.status(404).json({ error: 'Inbox introuvable' })

    // Get user's chatwoot access_token
    const { data: accounts } = await req.supabase
      .from('chatwoot_accounts')
      .select('access_token')
      .eq('user_id', req.user.user_id)
      .limit(1)
    const userToken = accounts?.[0]?.access_token || null

    // If assigning an agent, verify ownership and attach bot on Chatwoot
    if (agent_bot_id) {
      const { data: bot } = await req.supabase
        .from('agent_bots')
        .select('id, bot_id')
        .eq('id', agent_bot_id)
        .eq('user_id', req.user.user_id)
        .single()

      if (!bot) return res.status(404).json({ error: 'Agent introuvable' })

      if (bot.bot_id) {
        try {
          await attachBotToInbox(inbox.chatwoot_account_id, inbox.inbox_id, bot.bot_id, userToken)
        } catch (e) {
          console.log('attachBotToInbox error:', e.message)
        }
      }
    }

    // Update DB
    const { data, error } = await req.supabase
      .from('inboxes')
      .update({
        agent_bot_id: agent_bot_id || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', req.user.user_id)
      .select('*, agent_bots(id, name)')
      .single()

    if (error) throw error
    res.json({ inbox: data })
  } catch (err) {
    console.error('[inboxes]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// GET /api/chatwoot-sso — generate a temporary Chatwoot login URL via Platform API
router.get('/chatwoot-sso', checkRole('admin'), async (req, res) => {
  try {
    const chatwootUrl = getSetting('CHATWOOT_PLATFORM_URL')
    const platformToken = getSetting('CHATWOOT_PLATFORM_TOKEN')
    if (!chatwootUrl || !platformToken) {
      return res.status(400).json({ error: 'Chatwoot non configure' })
    }

    const { data: accounts } = await req.supabase
      .from('chatwoot_accounts')
      .select('chatwoot_user_id, account_id')
      .eq('user_id', req.user.user_id)
      .limit(1)

    if (!accounts?.length) {
      return res.status(400).json({ error: 'Compte Chatwoot introuvable' })
    }

    const { chatwoot_user_id, account_id } = accounts[0]

    // Call Chatwoot Platform API to generate a temporary login URL
    const loginRes = await fetch(`${chatwootUrl}/platform/api/v1/users/${chatwoot_user_id}/login`, {
      headers: { 'api_access_token': platformToken },
    })

    if (!loginRes.ok) {
      const text = await loginRes.text()
      console.error('[chatwoot-sso] Platform API error:', loginRes.status, text)
      return res.status(502).json({ error: 'Erreur Chatwoot SSO' })
    }

    const loginData = await loginRes.json()
    const ssoUrl = loginData.url
    if (!ssoUrl) {
      return res.status(502).json({ error: 'URL SSO non disponible' })
    }

    res.json({ url: ssoUrl })
  } catch (err) {
    console.error('[chatwoot-sso]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// GET /api/inboxes/:id/chatwoot — fetch widget settings from Chatwoot (source of truth)
router.get('/inboxes/:id/chatwoot', checkRole('admin'), async (req, res) => {
  try {
    const { id } = req.params
    const { data: inbox } = await req.supabase
      .from('inboxes')
      .select('id, inbox_id, chatwoot_account_id')
      .eq('id', id)
      .eq('user_id', req.user.user_id)
      .single()

    if (!inbox) return res.status(404).json({ error: 'Inbox introuvable' })

    const { data: accounts } = await req.supabase
      .from('chatwoot_accounts')
      .select('access_token')
      .eq('user_id', req.user.user_id)
      .limit(1)
    const userToken = accounts?.[0]?.access_token || null

    const chatwootInbox = await getInbox(inbox.chatwoot_account_id, inbox.inbox_id, userToken)
    res.json({
      name: chatwootInbox.name,
      avatar_url: chatwootInbox.avatar_url || null,
      widget_color: chatwootInbox.widget_color || null,
      website_url: chatwootInbox.web_widget_script?.website_url || chatwootInbox.channel?.website_url || null,
      welcome_title: chatwootInbox.web_widget_script?.welcome_title || chatwootInbox.channel?.welcome_title || null,
      welcome_tagline: chatwootInbox.web_widget_script?.welcome_tagline || chatwootInbox.channel?.welcome_tagline || null,
    })
  } catch (err) {
    console.error('[inboxes/chatwoot]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// PUT /api/inboxes/:id — update inbox settings on Chatwoot + local DB
router.put('/inboxes/:id', checkRole('admin'), async (req, res) => {
  try {
    const { id } = req.params
    const { name, website_url, welcome_title, welcome_tagline, widget_color } = req.body

    const { data: inbox } = await req.supabase
      .from('inboxes')
      .select('id, inbox_id, chatwoot_account_id')
      .eq('id', id)
      .eq('user_id', req.user.user_id)
      .single()

    if (!inbox) return res.status(404).json({ error: 'Inbox introuvable' })

    const { data: accounts } = await req.supabase
      .from('chatwoot_accounts')
      .select('access_token')
      .eq('user_id', req.user.user_id)
      .limit(1)
    const userToken = accounts?.[0]?.access_token || null

    // Build Chatwoot update payload
    const updates = {}
    if (name !== undefined) updates.name = name
    const channel = {}
    if (website_url !== undefined) channel.website_url = website_url
    if (welcome_title !== undefined) channel.welcome_title = welcome_title
    if (welcome_tagline !== undefined) channel.welcome_tagline = welcome_tagline
    if (widget_color !== undefined) channel.widget_color = widget_color
    if (Object.keys(channel).length > 0) updates.channel = channel

    await updateInbox(inbox.chatwoot_account_id, inbox.inbox_id, updates, userToken)

    // Update name in local DB if changed
    if (name !== undefined) {
      await req.supabase
        .from('inboxes')
        .update({ name, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', req.user.user_id)
    }

    const { data: updated } = await req.supabase
      .from('inboxes')
      .select('*, agent_bots(id, name)')
      .eq('id', id)
      .single()

    res.json({ inbox: updated })
  } catch (err) {
    console.error('[inboxes/update]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// POST /api/inboxes/:id/avatar — upload inbox avatar to Chatwoot
router.post('/inboxes/:id/avatar', checkRole('admin'), upload.single('avatar'), async (req, res) => {
  try {
    const { id } = req.params
    if (!req.file) return res.status(400).json({ error: 'Fichier requis' })

    const { data: inbox } = await req.supabase
      .from('inboxes')
      .select('id, inbox_id, chatwoot_account_id')
      .eq('id', id)
      .eq('user_id', req.user.user_id)
      .single()

    if (!inbox) return res.status(404).json({ error: 'Inbox introuvable' })

    const { data: accounts } = await req.supabase
      .from('chatwoot_accounts')
      .select('access_token')
      .eq('user_id', req.user.user_id)
      .limit(1)
    const userToken = accounts?.[0]?.access_token || null

    const result = await updateInboxAvatar(
      inbox.chatwoot_account_id,
      inbox.inbox_id,
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      userToken
    )

    res.json({ avatar_url: result.avatar_url || null })
  } catch (err) {
    console.error('[inboxes/avatar]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// GET /api/chatwoot-agents — list agents in user's Chatwoot account
router.get('/chatwoot-agents', checkRole('admin'), async (req, res) => {
  try {
    const { data: accounts } = await req.supabase
      .from('chatwoot_accounts')
      .select('account_id, access_token')
      .eq('user_id', req.user.user_id)
      .limit(1)

    if (!accounts?.length) {
      return res.status(400).json({ error: 'Compte Chatwoot introuvable' })
    }

    const { account_id, access_token } = accounts[0]
    const result = await accountApi(`/api/v1/accounts/${account_id}/agents`, 'GET', null, access_token)

    const agents = (result || []).map((a) => ({
      id: a.id,
      name: a.name,
      email: a.email,
      avatar_url: a.thumbnail || a.avatar_url || null,
      availability_status: a.availability_status || null,
    }))

    res.json({ agents })
  } catch (err) {
    console.error('[chatwoot-agents]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// GET /api/inboxes/:id/members — list inbox members from Chatwoot
router.get('/inboxes/:id/members', checkRole('admin'), async (req, res) => {
  try {
    const { id } = req.params
    const { data: inbox } = await req.supabase
      .from('inboxes')
      .select('id, inbox_id, chatwoot_account_id')
      .eq('id', id)
      .eq('user_id', req.user.user_id)
      .single()

    if (!inbox) return res.status(404).json({ error: 'Inbox introuvable' })

    const { data: accounts } = await req.supabase
      .from('chatwoot_accounts')
      .select('access_token')
      .eq('user_id', req.user.user_id)
      .limit(1)
    const userToken = accounts?.[0]?.access_token || null

    const result = await accountApi(
      `/api/v1/accounts/${inbox.chatwoot_account_id}/inbox_members/${inbox.inbox_id}`,
      'GET', null, userToken
    )

    const members = (result?.payload || result || []).map((m) => ({
      id: m.id,
      name: m.name,
      email: m.email,
      avatar_url: m.thumbnail || m.avatar_url || null,
    }))

    res.json({ members })
  } catch (err) {
    console.error('[inboxes/members]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// PUT /api/inboxes/:id/members — update inbox members on Chatwoot
router.put('/inboxes/:id/members', checkRole('admin'), async (req, res) => {
  try {
    const { id } = req.params
    const { user_ids } = req.body

    if (!Array.isArray(user_ids)) {
      return res.status(400).json({ error: 'user_ids requis (tableau)' })
    }

    const { data: inbox } = await req.supabase
      .from('inboxes')
      .select('id, inbox_id, chatwoot_account_id')
      .eq('id', id)
      .eq('user_id', req.user.user_id)
      .single()

    if (!inbox) return res.status(404).json({ error: 'Inbox introuvable' })

    const { data: accounts } = await req.supabase
      .from('chatwoot_accounts')
      .select('access_token')
      .eq('user_id', req.user.user_id)
      .limit(1)
    const userToken = accounts?.[0]?.access_token || null

    await accountApi(
      `/api/v1/accounts/${inbox.chatwoot_account_id}/inbox_members`,
      'POST',
      { inbox_id: inbox.inbox_id, user_ids },
      userToken
    )

    res.json({ success: true })
  } catch (err) {
    console.error('[inboxes/members]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

// DELETE /api/inboxes/:id
router.delete('/inboxes/:id', checkRole('admin'), async (req, res) => {
  try {
    const { id } = req.params
    const { error } = await req.supabase
      .from('inboxes')
      .delete()
      .eq('id', id)
      .eq('user_id', req.user.user_id)

    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    console.error('[inboxes]', err.message)
    res.status(500).json({ error: 'Erreur interne' })
  }
})

export default router
