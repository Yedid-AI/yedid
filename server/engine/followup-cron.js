/**
 * Follow-up Cron — Processes the followup queue.
 *
 * Every minute:
 *   1. Enqueue: check recent calls against active followup configs
 *   2. Process: for pending items past their scheduled_at, check if phone is in leads
 *      - If in leads → mark skipped
 *      - If NOT in leads → send WhatsApp message + create Chatwoot conversation → mark sent/failed
 */

import cron from 'node-cron'
import { sendMessage } from '../unipile.js'
import { accountApi } from '../chatwoot.js'
import { getSetting } from '../settings.js'
import { normalizePhone } from '../normalize-service.js'

let cronTask = null
let running = false

export function startFollowupCron(supabase) {
  if (!supabase) return

  cronTask = cron.schedule('* * * * *', () => {
    runFollowupCycle(supabase).catch((err) => {
      console.error('[Followup Cron] Error:', err.message)
    })
  })

  console.log('[Followup Cron] Started — every minute')
}

export function stopFollowupCron() {
  if (cronTask) {
    cronTask.stop()
    cronTask = null
    console.log('[Followup Cron] Stopped')
  }
}

async function runFollowupCycle(supabase) {
  if (running) {
    console.log('[Followup Cron] Already running, skipping')
    return
  }
  running = true
  try {
    // Step 1: Enqueue new calls
    await enqueueNewCalls(supabase)

    // Step 2: Process pending queue items
    await processQueue(supabase)
  } finally {
    running = false
  }
}

/**
 * Enqueue — find recent calls that match an active followup config's sources
 * and haven't been queued yet.
 */
async function enqueueNewCalls(supabase) {
  // Get all active followup configs
  const { data: configs, error: cfgErr } = await supabase
    .from('followup_config')
    .select('*')
    .eq('is_active', true)

  if (cfgErr || !configs?.length) return

  for (const config of configs) {
    if (!config.sources?.length || !config.whatsapp_account_id) continue

    // Build source filters
    const sourceFilters = config.sources

    // Find calls from the last 30 minutes that match any configured source
    const since = new Date(Date.now() - 30 * 60 * 1000).toISOString()

    const { data: recentCalls, error: callsErr } = await supabase
      .from('calls')
      .select('id, cdr_ani, user_name, cdr_ddi, start_call')
      .gte('start_call', since)
      .order('start_call', { ascending: false })

    if (callsErr || !recentCalls?.length) continue

    // Filter calls that match any configured source
    const matchingCalls = recentCalls.filter(call => {
      return sourceFilters.some(src =>
        (src.user_name === call.user_name) &&
        (src.cdr_ddi === call.cdr_ddi)
      )
    })

    if (!matchingCalls.length) continue

    // Check which phones are already queued (any status — avoid re-enqueuing)
    const phones = [...new Set(matchingCalls.map(c => c.cdr_ani).filter(Boolean))]
    const { data: existingQueue } = await supabase
      .from('followup_queue')
      .select('phone')
      .eq('user_id', config.user_id)
      .in('phone', phones)

    const alreadyQueued = new Set((existingQueue || []).map(q => q.phone))

    // Insert new queue entries
    const toInsert = []
    for (const call of matchingCalls) {
      const phone = normalizePhone(call.cdr_ani)
      if (!phone || alreadyQueued.has(phone)) continue
      alreadyQueued.add(phone) // dedup within this batch

      toInsert.push({
        user_id: config.user_id,
        phone,
        call_id: call.id,
        source_user_name: call.user_name,
        source_cdr_ddi: call.cdr_ddi,
        scheduled_at: new Date(Date.now() + config.delay_minutes * 60 * 1000).toISOString(),
        status: 'pending',
      })
    }

    if (toInsert.length > 0) {
      const { error: insertErr } = await supabase
        .from('followup_queue')
        .insert(toInsert)

      if (insertErr) {
        console.error('[Followup Cron] Enqueue error:', insertErr.message)
      } else {
        console.log(`[Followup Cron] Enqueued ${toInsert.length} follow-ups for user ${config.user_id}`)
      }
    }
  }
}

/**
 * Process — check pending queue items that are past their scheduled time.
 */
async function processQueue(supabase) {
  const now = new Date().toISOString()

  const { data: pending, error: pendErr } = await supabase
    .from('followup_queue')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_at', now)
    .order('scheduled_at', { ascending: true })
    .limit(50)

  if (pendErr || !pending?.length) return

  // Group by user_id to load config once per user
  const byUser = {}
  for (const item of pending) {
    if (!byUser[item.user_id]) byUser[item.user_id] = []
    byUser[item.user_id].push(item)
  }

  for (const [userId, items] of Object.entries(byUser)) {
    // Load the user's followup config with inbox join
    const { data: config } = await supabase
      .from('followup_config')
      .select('*, inboxes:followup_inbox_id(id, chatwoot_account_id, inbox_id, unipile_account_id)')
      .eq('user_id', parseInt(userId))
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()

    if (!config || !config.whatsapp_account_id) {
      // Config deactivated — skip all
      await supabase
        .from('followup_queue')
        .update({ status: 'skipped', result: 'Config deactivated', processed_at: now })
        .in('id', items.map(i => i.id))
      continue
    }

    // Check which phones exist in leads
    const phones = items.map(i => i.phone)
    const { data: leads } = await supabase
      .from('leads')
      .select('phone')
      .in('phone', phones)

    const leadPhones = new Set((leads || []).map(l => l.phone))

    // Resolve Chatwoot details for conversation tracking
    const chatwootInbox = config.inboxes
    const chatwootAccountId = chatwootInbox?.chatwoot_account_id
    const chatwootInboxId = chatwootInbox?.inbox_id
    // Get user's Chatwoot token as fallback
    let accessToken = getSetting('CHATWOOT_ADMIN_TOKEN')
    if (!accessToken) {
      const { data: cwAccounts } = await supabase
        .from('chatwoot_accounts')
        .select('access_token')
        .eq('user_id', parseInt(userId))
        .limit(1)
      accessToken = cwAccounts?.[0]?.access_token
    }

    // Deduplicate by phone — only process the first queue entry per phone,
    // mark the rest as skipped to prevent sending multiple messages
    const seenPhones = new Set()

    for (const item of items) {
      if (seenPhones.has(item.phone)) {
        // Duplicate queue entry for same phone — skip
        await supabase
          .from('followup_queue')
          .update({ status: 'skipped', result: 'Duplicate (same phone)', processed_at: now })
          .eq('id', item.id)
        continue
      }
      seenPhones.add(item.phone)

      if (leadPhones.has(item.phone)) {
        // Phone found in leads — skip
        await supabase
          .from('followup_queue')
          .update({ status: 'skipped', result: 'Already in leads', processed_at: now })
          .eq('id', item.id)
        continue
      }

      // Not in leads — send WhatsApp message + create Chatwoot conversation
      try {
        // Atomically claim this item — if another cycle already processed it, skip
        const { data: claimed, error: claimErr } = await supabase
          .from('followup_queue')
          .update({ status: 'processing', processed_at: new Date().toISOString() })
          .eq('id', item.id)
          .eq('status', 'pending')
          .select('id')
        if (claimErr || !claimed?.length) continue

        const message = config.message_template || 'שלום, ראינו שהתקשרת אלינו. איך נוכל לעזור?'

        // Send via Chatwoot → channel callback → Unipile (single path, no double send)
        // If Chatwoot inbox is configured, let the channel callback handle WhatsApp delivery
        const callMeta = {
          source: item.source_user_name || null,
          maskyoo_number: item.source_cdr_ddi || null,
          followup: true,
        }
        if (chatwootAccountId && chatwootInboxId && accessToken) {
          await createChatwootConversation(chatwootAccountId, chatwootInboxId, accessToken, item.phone, message, callMeta)
        } else {
          // Fallback: send directly via Unipile if no Chatwoot inbox
          await sendMessage(config.whatsapp_account_id, item.phone, message)
        }

        await supabase
          .from('followup_queue')
          .update({ status: 'sent', result: 'Message sent', processed_at: new Date().toISOString() })
          .eq('id', item.id)

        console.log(`[Followup Cron] Sent follow-up to ${item.phone}`)
      } catch (err) {
        console.error(`[Followup Cron] Send failed for ${item.phone}:`, err.message)
        await supabase
          .from('followup_queue')
          .update({ status: 'failed', result: err.message, processed_at: new Date().toISOString() })
          .eq('id', item.id)
      }
    }
  }
}

/**
 * Create or find a Chatwoot contact + conversation and post the initial outgoing message.
 * This ensures the conversation appears in Chatwoot for agent tracking.
 */
async function createChatwootConversation(chatwootAccountId, chatwootInboxId, accessToken, phone, message, callMeta = {}) {
  const searchQuery = phone.replace('+', '')
  let contactId = null
  let conversationId = null

  // Search existing contact
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
    console.log('[Followup Cron] Contact search failed:', e.message)
  }

  // Find existing open conversation on this inbox
  if (contactId) {
    try {
      const convResult = await accountApi(
        `/api/v1/accounts/${chatwootAccountId}/contacts/${contactId}/conversations`,
        'GET', null, accessToken
      )
      const conversations = convResult?.payload || []
      const existing = conversations.find(
        (c) => c.inbox_id === chatwootInboxId && (c.status === 'open' || c.status === 'pending')
      )
      if (existing) {
        conversationId = existing.id
      }
    } catch (e) {
      console.log('[Followup Cron] Conversation lookup failed:', e.message)
    }
  }

  // Update existing contact with call metadata
  if (contactId && Object.keys(callMeta).length > 0) {
    try {
      await accountApi(
        `/api/v1/accounts/${chatwootAccountId}/contacts/${contactId}`,
        'PUT',
        { custom_attributes: callMeta },
        accessToken
      )
    } catch (e) {
      console.log('[Followup Cron] Contact metadata update failed:', e.message)
    }
  }

  // Create contact if not found
  if (!contactId) {
    const newContact = await accountApi(
      `/api/v1/accounts/${chatwootAccountId}/contacts`,
      'POST',
      {
        inbox_id: chatwootInboxId,
        name: phone,
        phone_number: phone.startsWith('+') ? phone : `+${phone}`,
        custom_attributes: callMeta,
      },
      accessToken
    )
    contactId = newContact?.payload?.contact?.id || newContact?.id
    const sourceId = newContact?.payload?.contact?.contact_inboxes?.[0]?.source_id
    if (contactId && sourceId) {
      const conv = await accountApi(
        `/api/v1/accounts/${chatwootAccountId}/conversations`,
        'POST',
        { source_id: sourceId, inbox_id: chatwootInboxId, contact_id: contactId },
        accessToken
      )
      conversationId = conv?.id
    }
  }

  // Create conversation if still missing
  if (!conversationId && contactId) {
    const conv = await accountApi(
      `/api/v1/accounts/${chatwootAccountId}/conversations`,
      'POST',
      { inbox_id: chatwootInboxId, contact_id: contactId },
      accessToken
    )
    conversationId = conv?.id
  }

  // Post the outgoing message to Chatwoot
  if (conversationId) {
    await accountApi(
      `/api/v1/accounts/${chatwootAccountId}/conversations/${conversationId}/messages`,
      'POST',
      { content: message, message_type: 'outgoing' },
      accessToken
    )
    console.log(`[Followup Cron] Chatwoot conversation ${conversationId} created for ${phone}`)
  }
}
