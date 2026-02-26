import { Router } from 'express'
import { checkAuth, checkRole } from '../middleware.js'
import { getSetting } from '../settings.js'
import { createHostedAuthLink, getAccount, sendMessage, sendMessageWithAttachment, downloadAttachment, registerWebhook } from '../unipile.js'
import { createInbox, addInboxMember, attachBotToInbox, accountApi } from '../chatwoot.js'

const router = Router()

// ─── POST /api/whatsapp/connect ─── Generate hosted auth link for WhatsApp QR
router.post('/whatsapp/connect', checkAuth, checkRole('admin'), async (req, res) => {
  try {
    const appBaseUrl = getSetting('APP_BASE_URL')
    if (!appBaseUrl) return res.status(400).json({ error: 'APP_BASE_URL non configure' })

    const result = await createHostedAuthLink({
      callbackUrl: `${appBaseUrl}/inboxes?whatsapp=connected`,
      notifyUrl: `${appBaseUrl}/api/webhook/unipile/account`,
      name: String(req.user.user_id),
    })

    res.json({ url: result.url })
  } catch (err) {
    console.error('[whatsapp/connect]', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ─── POST /api/webhook/unipile/account ─── Unipile callback after WhatsApp QR scan
router.post('/webhook/unipile/account', async (req, res) => {
  // Respond immediately
  res.status(200).json({ ok: true })

  try {
    const { status, account_id, name } = req.body
    if (status !== 'CREATION_SUCCESS' || !account_id || !name) {
      console.log('[unipile/account] Ignored event:', status, account_id)
      return
    }

    // Handle followup- and dispatch- prefixed names
    const supabase = req.supabaseAdmin || req.supabase

    if (String(name).startsWith('followup-')) {
      const uid = parseInt(name.replace('followup-', ''))
      if (!uid) return

      console.log(`[unipile/account] Followup WhatsApp connected: account=${account_id}, user=${uid}`)

      // Get Unipile account details (phone number)
      const accountDetails = await getAccount(account_id)
      const phoneNumber = accountDetails?.connection_params?.im?.phone_number
        || accountDetails?.phone_number || ''

      // Create Chatwoot inbox on account 1
      const chatwootAccountId = 1
      // Get user's Chatwoot token as fallback (CHATWOOT_ADMIN_TOKEN is often not set)
      const { data: cwAccounts } = await supabase
        .from('chatwoot_accounts')
        .select('access_token')
        .eq('user_id', uid)
        .limit(1)
      const userToken = getSetting('CHATWOOT_ADMIN_TOKEN') || cwAccounts?.[0]?.access_token
      const appBaseUrl = getSetting('APP_BASE_URL')

      const inboxName = `Relance ${phoneNumber || account_id}`
      const inbox = await createInbox(chatwootAccountId, {
        name: inboxName,
        channel: { type: 'api', webhook_url: `${appBaseUrl}/api/webhook/chatwoot-channel` },
      }, userToken)

      await new Promise((r) => setTimeout(r, 2000))

      // Attach agent bot if configured in followup_config
      let agentBotDbId = null
      try {
        const { data: fcfg } = await supabase
          .from('followup_config')
          .select('agent_bot_id')
          .eq('user_id', uid)
          .limit(1)
          .maybeSingle()

        if (fcfg?.agent_bot_id) {
          const { data: botData } = await supabase
            .from('agent_bots')
            .select('id, bot_id')
            .eq('id', fcfg.agent_bot_id)
            .limit(1)
            .maybeSingle()

          if (botData?.bot_id) {
            agentBotDbId = botData.id
            await attachBotToInbox(chatwootAccountId, inbox.id, botData.bot_id, userToken)
            console.log(`[unipile/account] Followup agent bot ${botData.bot_id} attached to inbox ${inbox.id}`)
          }
        }
      } catch (e) {
        console.log('[unipile/account] Followup bot attachment skipped:', e.message)
      }

      // Insert inbox in DB
      const { data: newInbox, error: insertErr } = await supabase
        .from('inboxes')
        .insert({
          user_id: uid,
          chatwoot_account_id: chatwootAccountId,
          inbox_id: inbox.id,
          name: inboxName,
          channel_type: 'whatsapp',
          unipile_account_id: account_id,
          phone_number: phoneNumber,
          agent_bot_id: agentBotDbId,
        })
        .select('id')
        .single()

      if (insertErr) {
        console.error('[unipile/account] Followup inbox insert error:', insertErr.message)
        return
      }

      // Update followup_config
      const { error: upsertErr } = await supabase
        .from('followup_config')
        .upsert({
          user_id: uid,
          whatsapp_account_id: account_id,
          whatsapp_connected: true,
          followup_inbox_id: newInbox.id,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })
      if (upsertErr) {
        console.error('[unipile/account] Followup config upsert error:', upsertErr.message)
      }

      // Register webhook for incoming messages
      try { await registerWebhook(`${appBaseUrl}/api/webhook/unipile/message`) } catch {}

      console.log(`[unipile/account] Followup inbox fully provisioned for user ${uid}`)
      return
    }

    if (String(name).startsWith('dispatch-')) {
      const uid = parseInt(name.replace('dispatch-', ''))
      if (!uid) return

      console.log(`[unipile/account] Dispatch WhatsApp connected: account=${account_id}, user=${uid}`)

      // Create full inbox for dispatch on Chatwoot account 1
      const accountDetails = await getAccount(account_id)
      const phoneNumber = accountDetails?.connection_params?.im?.phone_number
        || accountDetails?.phone_number || ''

      const chatwootAccountId = 1
      // Get user's Chatwoot token as fallback (CHATWOOT_ADMIN_TOKEN is often not set)
      const { data: cwAccounts } = await supabase
        .from('chatwoot_accounts')
        .select('access_token')
        .eq('user_id', uid)
        .limit(1)
      const userToken = getSetting('CHATWOOT_ADMIN_TOKEN') || cwAccounts?.[0]?.access_token
      const appBaseUrl = getSetting('APP_BASE_URL')

      const inboxName = `Dispatch ${phoneNumber || account_id}`
      const inbox = await createInbox(chatwootAccountId, {
        name: inboxName,
        channel: { type: 'api', webhook_url: `${appBaseUrl}/api/webhook/chatwoot-channel` },
      }, userToken)

      await new Promise((r) => setTimeout(r, 2000))

      // Insert inbox in DB
      const { data: newInbox, error: insertErr } = await supabase
        .from('inboxes')
        .insert({
          user_id: uid,
          chatwoot_account_id: chatwootAccountId,
          inbox_id: inbox.id,
          name: inboxName,
          channel_type: 'whatsapp',
          unipile_account_id: account_id,
          phone_number: phoneNumber,
        })
        .select('id')
        .single()

      if (insertErr) {
        console.error('[unipile/account] Dispatch inbox insert error:', insertErr.message)
        return
      }

      // Link to dispatch_config
      const { error: upsertErr } = await supabase
        .from('dispatch_config')
        .upsert({
          user_id: uid,
          dispatch_inbox_id: newInbox.id,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })

      if (upsertErr) {
        console.error('[unipile/account] Dispatch config upsert error:', upsertErr.message)
      }

      // Register webhook
      try { await registerWebhook(`${appBaseUrl}/api/webhook/unipile/message`) } catch {}

      console.log(`[unipile/account] Dispatch inbox provisioned for user ${uid}`)
      return
    }

    const userId = parseInt(name)
    if (!userId) {
      console.error('[unipile/account] Invalid user_id in name:', name)
      return
    }

    console.log(`[unipile/account] WhatsApp connected: account=${account_id}, user=${userId}`)

    // 1. Get Unipile account details (phone number)
    const accountDetails = await getAccount(account_id)
    const phoneNumber = accountDetails?.connection_params?.im?.phone_number
      || accountDetails?.phone_number
      || ''
    console.log(`[unipile/account] Phone: ${phoneNumber}`)

    // 2. Look up user's Chatwoot account
    const { data: accounts } = await supabase
      .from('chatwoot_accounts')
      .select('account_id, chatwoot_user_id, access_token')
      .eq('user_id', userId)
      .limit(1)

    if (!accounts?.length) {
      console.error('[unipile/account] No Chatwoot account for user:', userId)
      return
    }

    const chatwootAccountId = accounts[0].account_id
    const chatUserId = accounts[0].chatwoot_user_id
    const userToken = accounts[0].access_token
    const appBaseUrl = getSetting('APP_BASE_URL')
    const channelWebhookUrl = `${appBaseUrl}/api/webhook/chatwoot-channel`

    // 3. Create Chatwoot API channel inbox
    const inboxName = `WhatsApp ${phoneNumber || account_id}`
    const inbox = await createInbox(chatwootAccountId, {
      name: inboxName,
      channel: {
        type: 'api',
        webhook_url: channelWebhookUrl,
      },
    }, userToken)

    console.log(`[unipile/account] Chatwoot inbox created: ${inbox.id}`)

    // 4. Wait for propagation + add member
    await new Promise((r) => setTimeout(r, 2000))
    if (chatUserId) {
      try {
        await addInboxMember(chatwootAccountId, inbox.id, chatUserId, userToken)
      } catch (e) {
        console.log('[unipile/account] addInboxMember skipped:', e.message)
      }
    }

    // 5. Find user's active agent bot and attach to Chatwoot inbox
    let agentBotDbId = null
    try {
      const { data: bots } = await supabase
        .from('agent_bots')
        .select('id, bot_id')
        .eq('user_id', userId)
        .eq('is_active', true)
        .limit(1)

      if (bots?.length) {
        const agentBot = bots[0]
        agentBotDbId = agentBot.id
        await attachBotToInbox(chatwootAccountId, inbox.id, agentBot.bot_id, userToken)
        console.log(`[unipile/account] Agent bot ${agentBot.bot_id} attached to inbox ${inbox.id}`)
      } else {
        console.log('[unipile/account] No active agent bot found for user — assign one manually')
      }
    } catch (e) {
      console.log('[unipile/account] Agent bot attachment skipped:', e.message)
    }

    // 6. Insert inbox in DB (with agent_bot_id if found)
    const { error: insertError } = await supabase
      .from('inboxes')
      .insert({
        user_id: userId,
        chatwoot_account_id: chatwootAccountId,
        inbox_id: inbox.id,
        name: inboxName,
        channel_type: 'whatsapp',
        unipile_account_id: account_id,
        phone_number: phoneNumber,
        agent_bot_id: agentBotDbId,
      })

    if (insertError) {
      console.error('[unipile/account] DB insert error:', insertError.message)
      return
    }

    // 7. Register Unipile webhook for incoming messages (idempotent)
    try {
      await registerWebhook(`${appBaseUrl}/api/webhook/unipile/message`)
    } catch (e) {
      console.log('[unipile/account] Webhook registration skipped:', e.message)
    }

    console.log(`[unipile/account] WhatsApp inbox fully provisioned for user ${userId}`)
  } catch (err) {
    console.error('[unipile/account] Error:', err.message)
  }
})

// ─── POST /api/webhook/unipile/message ─── Incoming WhatsApp messages from Unipile
router.post('/webhook/unipile/message', async (req, res) => {
  // Respond immediately
  res.status(200).json({ ok: true })

  try {
    console.log('[unipile/message] Content-Type:', req.headers['content-type'])
    console.log('[unipile/message] Content-Length:', req.headers['content-length'])
    console.log('[unipile/message] Body keys:', Object.keys(req.body || {}))
    console.log('[unipile/message] Webhook received:', JSON.stringify(req.body).slice(0, 800))

    const body = req.body

    // Unipile can wrap the payload in a top-level object — normalize
    const event = body.event
    const account_id = body.account_id
    const is_sender = body.is_sender
    const sender = body.sender
    const message = body.message || body.text || body.body
    const attachments = body.attachments
    const quoted = body.quoted

    // Skip our own messages and non-message events
    if (is_sender) {
      console.log('[unipile/message] Skipping own message')
      return
    }
    if (event && event !== 'message_received' && event !== 'message.received') {
      console.log('[unipile/message] Skipping event:', event)
      return
    }

    if (!account_id) {
      console.log('[unipile/message] No account_id in webhook')
      return
    }

    const supabase = req.supabaseAdmin || req.supabase

    // 1. Look up inbox by Unipile account_id
    const { data: inboxData } = await supabase
      .from('inboxes')
      .select('id, user_id, chatwoot_account_id, inbox_id')
      .eq('unipile_account_id', account_id)
      .limit(1)

    if (!inboxData?.length) {
      console.log('[unipile/message] No inbox for Unipile account:', account_id)
      return
    }

    const inbox = inboxData[0]

    // 2. Get Chatwoot access token
    const { data: accounts } = await supabase
      .from('chatwoot_accounts')
      .select('access_token')
      .eq('user_id', inbox.user_id)
      .limit(1)

    const accessToken = accounts?.[0]?.access_token || getSetting('CHATWOOT_ADMIN_TOKEN')
    const chatwootAccountId = inbox.chatwoot_account_id
    const chatwootInboxId = inbox.inbox_id

    // 3. Extract sender phone
    const senderPhone = sender?.attendee_specifics?.phone_number
      || sender?.attendee_public_identifier?.split('@')[0]
      || ''

    if (!senderPhone) {
      console.log('[unipile/message] No sender phone number')
      return
    }

    // 4. Search for existing contact in Chatwoot
    const searchQuery = senderPhone.replace('+', '')
    let contactId = null
    let conversationId = null

    try {
      const searchResult = await accountApi(
        `/api/v1/accounts/${chatwootAccountId}/contacts/search?q=${encodeURIComponent(searchQuery)}&include_contacts=true`,
        'GET', null, accessToken
      )
      const contacts = searchResult?.payload || []
      if (contacts.length > 0) {
        contactId = contacts[0].id
      }
    } catch (e) {
      console.log('[unipile/message] Contact search failed:', e.message)
    }

    // 5. If contact exists, find open conversation for this inbox
    if (contactId) {
      try {
        const convResult = await accountApi(
          `/api/v1/accounts/${chatwootAccountId}/contacts/${contactId}/conversations`,
          'GET', null, accessToken
        )
        const conversations = convResult?.payload || []
        // Find an open/pending conversation on this inbox
        const existing = conversations.find(
          (c) => c.inbox_id === chatwootInboxId && (c.status === 'open' || c.status === 'pending')
        )
        if (existing) {
          conversationId = existing.id
        }
      } catch (e) {
        console.log('[unipile/message] Conversation lookup failed:', e.message)
      }
    }

    // 6. If no contact, create one
    if (!contactId) {
      try {
        const newContact = await accountApi(
          `/api/v1/accounts/${chatwootAccountId}/contacts`,
          'POST',
          {
            inbox_id: chatwootInboxId,
            name: sender?.attendee_name || senderPhone,
            phone_number: senderPhone.startsWith('+') ? senderPhone : `+${senderPhone}`,
          },
          accessToken
        )
        contactId = newContact?.payload?.contact?.id || newContact?.id
        // Get source_id for conversation creation
        const sourceId = newContact?.payload?.contact?.contact_inboxes?.[0]?.source_id
        if (contactId && sourceId) {
          // Create conversation
          const conv = await accountApi(
            `/api/v1/accounts/${chatwootAccountId}/conversations`,
            'POST',
            {
              source_id: sourceId,
              inbox_id: chatwootInboxId,
              contact_id: contactId,
            },
            accessToken
          )
          conversationId = conv?.id
        }
      } catch (e) {
        console.error('[unipile/message] Contact/conversation creation failed:', e.message)
        return
      }
    }

    // 7. If still no conversation, create one
    if (!conversationId && contactId) {
      try {
        const conv = await accountApi(
          `/api/v1/accounts/${chatwootAccountId}/conversations`,
          'POST',
          { inbox_id: chatwootInboxId, contact_id: contactId },
          accessToken
        )
        conversationId = conv?.id
      } catch (e) {
        console.error('[unipile/message] Conversation creation failed:', e.message)
        return
      }
    }

    if (!conversationId) {
      console.error('[unipile/message] Could not find or create conversation')
      return
    }

    // 8. Build message content (include quoted context if present)
    let content = message || ''
    if (quoted && quoted.message) {
      content = `> ${quoted.message}\n\n${content}`
    }

    // 9. Post message to Chatwoot (handle attachments if present)
    if (attachments && attachments.length > 0) {
      // Check for audio/voice attachments — transcribe before relaying
      const audioAtt = attachments.find(a => {
        const ct = (a.content_type || a.type || '').toLowerCase()
        const fn = (a.file_name || a.name || '').toLowerCase()
        return ct.startsWith('audio/') || fn.endsWith('.ogg') || fn.endsWith('.opus') || fn.endsWith('.mp3') || fn.endsWith('.m4a')
      })

      if (audioAtt && !content) {
        // Voice message: transcribe with Whisper
        try {
          const attUrl = audioAtt.url || audioAtt.data_url
          const { transcribeAudio } = await import('../engine/voice.js')
          const { transcription } = await transcribeAudio(attUrl)
          content = `🎤 ${transcription}`
          console.log(`[unipile/message] Voice transcribed: "${transcription.slice(0, 100)}"`)
        } catch (whisperErr) {
          console.error('[unipile/message] Whisper transcription failed:', whisperErr.message)
          content = '🎤 [message vocal]'
        }
      }

      // For messages with attachments, use multipart upload
      for (const att of attachments) {
        try {
          const attUrl = att.url || att.data_url
          if (!attUrl) continue
          const { buffer, contentType } = await downloadAttachment(attUrl)
          const fileName = att.file_name || att.name || 'attachment'

          const chatwootUrl = getSetting('CHATWOOT_PLATFORM_URL')
          const formData = new FormData()
          formData.append('content', content || '')
          formData.append('message_type', 'incoming')
          formData.append('attachments[]', new Blob([buffer], { type: contentType }), fileName)

          const uploadRes = await fetch(
            `${chatwootUrl}/api/v1/accounts/${chatwootAccountId}/conversations/${conversationId}/messages`,
            {
              method: 'POST',
              headers: { 'api_access_token': accessToken },
              body: formData,
            }
          )
          if (!uploadRes.ok) {
            console.error('[unipile/message] Chatwoot attachment upload failed:', uploadRes.status)
          }
          // Only include text content with the first attachment
          content = ''
        } catch (attErr) {
          console.error('[unipile/message] Attachment processing error:', attErr.message)
        }
      }
      // If there's remaining text not yet sent (no attachments succeeded)
      if (content) {
        await accountApi(
          `/api/v1/accounts/${chatwootAccountId}/conversations/${conversationId}/messages`,
          'POST',
          { content, message_type: 'incoming' },
          accessToken
        )
      }
    } else {
      // Text-only message
      await accountApi(
        `/api/v1/accounts/${chatwootAccountId}/conversations/${conversationId}/messages`,
        'POST',
        { content, message_type: 'incoming' },
        accessToken
      )
    }

    console.log(`[unipile/message] Relayed to Chatwoot: conv=${conversationId}, from=${senderPhone}`)
  } catch (err) {
    console.error('[unipile/message] Error:', err.message)
  }
})

// ─── POST /api/webhook/chatwoot-channel ─── Outgoing messages from Chatwoot → WhatsApp
router.post('/webhook/chatwoot-channel', async (req, res) => {
  // Respond immediately
  res.status(200).json({ ok: true })

  try {
    const body = req.body
    console.log('[chatwoot-channel] Webhook received:', JSON.stringify(body).slice(0, 500))

    const event = body.event
    const messageType = body.message_type

    // Only process outgoing messages (message_type can be 'outgoing' or 1)
    const isOutgoing = messageType === 'outgoing' || messageType === 1
    if (event !== 'message_created' || !isOutgoing) {
      console.log(`[chatwoot-channel] Skipping: event=${event}, message_type=${messageType}`)
      return
    }

    const content = body.content || ''
    const chatwootInboxId = body.conversation?.inbox_id || body.inbox?.id
    const senderPhone = body.conversation?.meta?.sender?.phone_number

    if (!chatwootInboxId || !senderPhone) {
      console.log('[chatwoot-channel] Missing inbox_id or sender phone')
      return
    }

    const supabase = req.supabaseAdmin || req.supabase

    // Look up inbox to get Unipile account_id
    const { data: inboxData } = await supabase
      .from('inboxes')
      .select('unipile_account_id, channel_type')
      .eq('inbox_id', chatwootInboxId)
      .eq('channel_type', 'whatsapp')
      .limit(1)

    if (!inboxData?.length) {
      // Not a WhatsApp inbox, ignore
      return
    }

    const unipileAccountId = inboxData[0].unipile_account_id
    if (!unipileAccountId) {
      console.error('[chatwoot-channel] No Unipile account_id for inbox:', chatwootInboxId)
      return
    }

    // Check for attachments
    const msgAttachments = body.conversation?.messages?.[0]?.attachments || body.attachments || []

    if (msgAttachments.length > 0) {
      for (const att of msgAttachments) {
        try {
          const attUrl = att.data_url || att.url
          if (!attUrl) continue
          const { buffer, contentType } = await downloadAttachment(attUrl)
          const fileName = att.file_name || 'attachment'
          await sendMessageWithAttachment(unipileAccountId, senderPhone, content, buffer, fileName, contentType)
        } catch (attErr) {
          console.error('[chatwoot-channel] Attachment send error:', attErr.message)
          // Fallback: send text only
          if (content) await sendMessage(unipileAccountId, senderPhone, content)
        }
      }
    } else if (content) {
      await sendMessage(unipileAccountId, senderPhone, content)
    }

    console.log(`[chatwoot-channel] Relayed to WhatsApp: ${senderPhone}`)
  } catch (err) {
    console.error('[chatwoot-channel] Error:', err.message)
  }
})

export default router
