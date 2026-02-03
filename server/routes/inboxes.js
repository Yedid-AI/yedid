import { Router } from 'express'
import { checkRole } from '../middleware.js'
import { createInbox, attachBotToInbox, addInboxMember } from '../chatwoot.js'
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
      channel_type: 'web',
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
    const { name, website_url, welcome_title, welcome_tagline } = req.body
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

    // Create inbox on Chatwoot (using user's own token)
    const inbox = await createInbox(accountId, {
      name,
      websiteUrl: website_url || 'https://cardynal.io',
      welcomeTitle: welcome_title || `Bienvenue chez ${name}`,
      welcomeTagline: welcome_tagline || 'Comment puis-je vous aider ?',
    }, userToken)

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
