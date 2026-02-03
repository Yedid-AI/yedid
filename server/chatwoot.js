import { getSetting } from './settings.js'

// Platform API — /platform/api/v1/... (uses Platform Token)
async function platformApi(path, method = 'GET', body = null) {
  const url = getSetting('CHATWOOT_PLATFORM_URL')
  const token = getSetting('CHATWOOT_PLATFORM_TOKEN')
  if (!url || !token) {
    throw new Error('Chatwoot non configure. Ajoutez CHATWOOT_PLATFORM_URL et CHATWOOT_PLATFORM_TOKEN dans Environnement.')
  }
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', 'api_access_token': token },
  }
  if (body) opts.body = JSON.stringify(body)
  const res = await fetch(`${url}${path}`, opts)
  if (!res.ok) throw new Error(`Chatwoot Platform (${res.status}): ${await res.text()}`)
  return res.json()
}

// Account API — /api/v1/accounts/{id}/... (uses user access token or fallback to CHATWOOT_ADMIN_TOKEN)
export async function accountApi(path, method = 'GET', body = null, accessToken = null) {
  const url = getSetting('CHATWOOT_PLATFORM_URL')
  const token = accessToken || getSetting('CHATWOOT_ADMIN_TOKEN')
  if (!token) {
    throw new Error('Token Chatwoot manquant. Verifiez le provisioning ou CHATWOOT_ADMIN_TOKEN.')
  }
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', 'api_access_token': token },
  }
  if (body) opts.body = JSON.stringify(body)
  const res = await fetch(`${url}${path}`, opts)
  if (!res.ok) throw new Error(`Chatwoot Account (${res.status}): ${await res.text()}`)
  return res.json()
}

// --- Split functions ---

// Steps 1-4, 6: Create account + user + link + DB + super admin
export async function provisionAccount(user, supabase) {
  // 1. Create Chatwoot account
  const account = await platformApi('/platform/api/v1/accounts', 'POST', {
    name: user.enterprise || user.first_name || user.email,
  })
  const accountId = account.id
  console.log(`Provision [${user.email}] step 1: account ${accountId}`)

  // 2. Create Chatwoot user (random password per user)
  const { randomBytes } = await import('crypto')
  const tempPassword = randomBytes(24).toString('base64url') + '!A1'
  const chatUser = await platformApi('/platform/api/v1/users', 'POST', {
    name: [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email,
    email: user.email,
    password: tempPassword,
    custom_attributes: {},
  })
  const chatUserId = chatUser.id
  console.log(`Provision [${user.email}] step 2: user ${chatUserId}`)

  // 3. Link user to account as administrator
  await platformApi(`/platform/api/v1/accounts/${accountId}/account_users`, 'POST', {
    user_id: chatUserId,
    role: 'administrator',
  })
  console.log(`Provision [${user.email}] step 3: account_user linked as administrator`)

  // 4. DB update — insert chatwoot_accounts
  const accessToken = chatUser.access_token
  const pubsubToken = chatUser.pubsub_token
  await supabase.from('chatwoot_accounts').upsert({
    user_id: user.id,
    account_id: accountId,
    chatwoot_user_id: chatUserId,
    access_token: accessToken || null,
    pubsub_token: pubsubToken || null,
  }, { onConflict: 'user_id' })
  console.log(`Provision [${user.email}] step 4: DB updated (account+user)`)

  // 6. Add super admin (user_id=1) as administrator on the account
  try {
    await platformApi(`/platform/api/v1/accounts/${accountId}/account_users`, 'POST', {
      user_id: 1,
      role: 'administrator',
    })
    console.log(`Provision [${user.email}] step 6: super admin added`)
  } catch (e) {
    console.log(`Provision [${user.email}] step 6: super admin skipped -`, e.message)
  }

  return { accountId, chatUserId, accessToken, pubsubToken }
}

// Step 5: Create inbox via Account API (web_widget or api channel)
export async function createInbox(accountId, options = {}, accessToken = null) {
  const channel = options.channel || {
    type: 'web_widget',
    website_url: options.websiteUrl || 'https://cardynal.io',
    welcome_title: options.welcomeTitle || 'Bienvenue',
    welcome_tagline: options.welcomeTagline || 'Comment puis-je vous aider ?',
  }
  const inbox = await accountApi(`/api/v1/accounts/${accountId}/inboxes`, 'POST', {
    name: options.name || 'Inbox',
    channel,
  }, accessToken)
  console.log(`createInbox: inbox ${inbox.id} (${channel.type}) on account ${accountId}`)
  return inbox
}

// Step 7: Create agent bot via Platform API
export async function createAgentBot(accountId, name, outgoingUrl) {
  const bot = await platformApi('/platform/api/v1/agent_bots', 'POST', {
    name,
    outgoing_url: outgoingUrl,
    account_id: accountId,
  })
  console.log(`createAgentBot: bot ${bot.id} on account ${accountId}`)
  return bot
}

// Step 8: Attach bot to inbox via Account API
export async function attachBotToInbox(accountId, inboxId, botId, accessToken = null) {
  await accountApi(`/api/v1/accounts/${accountId}/inboxes/${inboxId}/set_agent_bot`, 'POST', {
    agent_bot: botId,
  }, accessToken)
  console.log(`attachBotToInbox: bot ${botId} -> inbox ${inboxId} on account ${accountId}`)
}

// Add user as inbox member
export async function addInboxMember(accountId, inboxId, chatUserId, accessToken = null) {
  await accountApi(`/api/v1/accounts/${accountId}/inbox_members`, 'POST', {
    inbox_id: inboxId,
    user_ids: [chatUserId],
  }, accessToken)
  console.log(`addInboxMember: user ${chatUserId} -> inbox ${inboxId}`)
}

// Legacy: full provisioning (kept for backward compat during transition)
export async function provisionChatwoot(user, supabase) {
  const appBaseUrl = getSetting('APP_BASE_URL')
  const webhookUrl = appBaseUrl ? `${appBaseUrl}/api/webhook/chatwoot` : ''

  const { accountId, chatUserId } = await provisionAccount(user, supabase)

  // 5. Create inbox
  const inbox = await createInbox(accountId, {
    name: user.enterprise || user.email,
    websiteUrl: `https://${user.website || 'cardynal.io'}`,
    welcomeTitle: `Hello, welcome to ${user.enterprise || 'Cardynal'}`,
    welcomeTagline: 'How can I help?',
  })
  const inboxId = inbox.id
  const websiteToken = inbox.website_token
  console.log(`Provision [${user.email}] step 5: inbox ${inboxId}`)

  // 7. Create agent bot
  let botId = null
  let botToken = null
  if (webhookUrl) {
    const bot = await createAgentBot(accountId, user.enterprise || user.email, webhookUrl)
    botId = bot.id
    botToken = bot.access_token
    console.log(`Provision [${user.email}] step 7: bot ${botId}`)
  } else {
    console.log(`Provision [${user.email}] step 7: bot skipped (no APP_BASE_URL)`)
  }

  // 8. Attach bot to inbox
  if (botId) {
    await attachBotToInbox(accountId, inboxId, botId)
    console.log(`Provision [${user.email}] step 8: bot attached to inbox`)
  }

  // 9. Wait for propagation
  await new Promise((r) => setTimeout(r, 3000))
  console.log(`Provision [${user.email}] step 9: wait done`)

  // 10. Add user as agent on inbox
  await addInboxMember(accountId, inboxId, chatUserId)
  console.log(`Provision [${user.email}] step 10: agent added to inbox`)

  // 11. Insert inbox row
  const { error } = await supabase.from('inboxes').insert({
    user_id: user.id,
    chatwoot_account_id: accountId,
    inbox_id: inboxId,
    website_token: websiteToken,
    bot_token: botToken,
    name: user.enterprise || user.email,
  })

  if (error) throw error
  console.log(`Provision [${user.email}] done!`)

  return {
    chatwoot_account_id: accountId,
    chatwoot_user_id: chatUserId,
    inbox_id: inboxId,
    website_token: websiteToken,
  }
}
