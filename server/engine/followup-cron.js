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

// Best-effort mapping from a Maskyoo source line name to the spoken topic to
// inject into the relance message. The template embeds this as " (בנוגע ל...)"
// after the branch name. If no match, we just say nothing — better silence than
// a wrong topic.
const TOPIC_BY_SOURCE_HINT = [
  { match: /סיעוד|זכאות|גמלת/i, topic: 'בנוגע לסיעוד וזכאות' },
  { match: /עובד[ -]?זר|זרים/i,   topic: 'בנוגע להעסקת עובד זר' },
  { match: /פרטי|השלמה/i,         topic: 'בנוגע לשירות פרטי' },
  { match: /אשפוז|בית[ -]?חולים/i, topic: 'בנוגע להשגחה בבית חולים' },
  { match: /גיוס|מטפל/i,          topic: 'בנוגע לגיוס מטפלים' },
]

function topicForSource(source) {
  if (!source) return ''
  for (const { match, topic } of TOPIC_BY_SOURCE_HINT) {
    if (match.test(source)) return ' ' + topic
  }
  return ''
}

function timeAgoLabel(callDate) {
  if (!callDate) return 'לאחרונה'
  const diffMin = Math.max(1, Math.round((Date.now() - new Date(callDate)) / 60000))
  if (diffMin < 60) return `לפני ${diffMin} דקות`
  const diffH = Math.round(diffMin / 60)
  if (diffH < 6) return `לפני ${diffH} שעות`
  if (diffH < 24) return 'לפני כמה שעות'
  const diffD = Math.round(diffH / 24)
  if (diffD === 1) return 'אתמול'
  return `לפני ${diffD} ימים`
}

/**
 * Substitute {source}, {topic}, {time_ago} in a relance template using the queue
 * item + originating call. Falls back to empty strings rather than printing the
 * literal placeholder (looks unprofessional in WhatsApp).
 */
export function expandTemplate(template, { source, callDate }) {
  if (!template) return ''
  return template
    .replace(/\{source\}/g, source || '')
    .replace(/\{topic\}/g, topicForSource(source))
    .replace(/\{time_ago\}/g, timeAgoLabel(callDate))
}

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

// Recover queue items stuck in 'processing' (process crashed between claim and final mark).
// Without this they would never be retried — but also never be re-sent since their phone
// would still be claimed. After STUCK_PROCESSING_MIN we assume the previous attempt died
// and reset to 'pending' so the next cycle can retry.
const STUCK_PROCESSING_MIN = 10

async function recoverStuckProcessing(supabase) {
  const cutoff = new Date(Date.now() - STUCK_PROCESSING_MIN * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('followup_queue')
    .update({ status: 'pending', result: null })
    .eq('status', 'processing')
    .lte('processed_at', cutoff)
    .select('id')
  if (error) {
    console.error('[Followup Cron] Recovery error:', error.message)
    return
  }
  if (data?.length) {
    console.log(`[Followup Cron] Recovered ${data.length} stuck items (>${STUCK_PROCESSING_MIN}m in processing)`)
  }
}

async function runFollowupCycle(supabase) {
  if (running) {
    console.log('[Followup Cron] Already running, skipping')
    return
  }
  running = true
  try {
    // Step 0: Recover items stuck in 'processing' from a previous crash
    await recoverStuckProcessing(supabase)

    // Step 1: Enqueue new calls
    await enqueueNewCalls(supabase)

    // Step 2: Process pending queue items
    await processQueue(supabase)

    // Step 3: Mark replies / lead conversions on already-sent items so the
    // funnel is measurable and 2nd-attempt enqueueing knows what to skip.
    await markRepliesAndConversions(supabase)

    // Step 4: For sent 1st attempts older than the configured window with no
    // reply and no resulting lead, schedule a softer 2nd attempt.
    await enqueueSecondAttempts(supabase)
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
    if (!config.whatsapp_account_id) continue

    // Resolve source filters: org-based lines or legacy JSONB sources
    let sourceFilters = []
    if (config.org_id) {
      const { data: orgLines } = await supabase
        .from('maskyoo_lines')
        .select('user_name, cdr_ddi')
        .eq('org_id', config.org_id)
      sourceFilters = orgLines || []
    } else if (config.sources?.length) {
      sourceFilters = config.sources
    }

    if (!sourceFilters.length) continue

    // Find calls from the last (delay_minutes + 30min) so a missed cron cycle doesn't drop calls.
    // Without this, a call that arrives just before delay_minutes elapsed but after the 30min
    // window would never be picked up if the cron is paused/crashed for a few minutes.
    const lookbackMin = Math.max(30, (config.delay_minutes || 0) + 30)
    const since = new Date(Date.now() - lookbackMin * 60 * 1000).toISOString()

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

    // Check which phones are already queued (any status — avoid re-enqueuing).
    // Normalize before querying so we compare apples to apples — the queue stores
    // normalized phones, raw cdr_ani must be normalized first or dedup misses.
    const phones = [...new Set(
      matchingCalls.map(c => normalizePhone(c.cdr_ani)).filter(Boolean)
    )]
    const { data: existingQueue } = phones.length ? await supabase
      .from('followup_queue')
      .select('phone')
      .eq('user_id', config.user_id)
      .in('phone', phones) : { data: [] }

    const alreadyQueued = new Set((existingQueue || []).map(q => q.phone))

    // Insert new queue entries
    const toInsert = []
    for (const call of matchingCalls) {
      const phone = normalizePhone(call.cdr_ani)
      if (!phone || alreadyQueued.has(phone)) continue
      alreadyQueued.add(phone) // dedup within this batch

      toInsert.push({
        user_id: config.user_id,
        org_id: config.org_id || null,
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
        console.log(`[Followup Cron] Enqueued ${toInsert.length} follow-ups for user ${config.user_id} org ${config.org_id || 'legacy'}`)
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

  // Group by user_id + org_id to load config once per combo
  const byKey = {}
  for (const item of pending) {
    const key = `${item.user_id}|${item.org_id || 'null'}`
    if (!byKey[key]) byKey[key] = { userId: item.user_id, orgId: item.org_id || null, items: [] }
    byKey[key].items.push(item)
  }

  for (const { userId, orgId, items } of Object.values(byKey)) {
    // Load the followup config for this user+org with inbox join
    const configQuery = supabase
      .from('followup_config')
      .select('*, inboxes:followup_inbox_id(id, chatwoot_account_id, inbox_id, unipile_account_id)')
      .eq('user_id', userId)
      .eq('is_active', true)

    if (orgId) {
      configQuery.eq('org_id', orgId)
    } else {
      configQuery.is('org_id', null)
    }

    const { data: config } = await configQuery.limit(1).maybeSingle()

    if (!config || !config.whatsapp_account_id) {
      // Config deactivated — skip all
      await supabase
        .from('followup_queue')
        .update({ status: 'skipped', result: 'Config deactivated', processed_at: now })
        .in('id', items.map(i => i.id))
      continue
    }

    // Skip follow-up if a lead exists for this phone that is BOTH recently touched AND still active.
    // A lead in a terminal state (handled / not_relevant / no_answer) shouldn't block a fresh follow-up
    // triggered by a *new* call — it just means we already dealt with this person on a previous cycle.
    const phones = items.map(i => i.phone)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { data: leads } = await supabase
      .from('leads')
      .select('phone, status')
      .in('phone', phones)
      .gte('updated_at', oneHourAgo)

    const TERMINAL_STATUSES = new Set(['handled', 'not_relevant', 'no_answer'])
    const leadPhones = new Set(
      (leads || [])
        .filter(l => !TERMINAL_STATUSES.has(l.status))
        .map(l => l.phone)
    )

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

        // Pick the right template for this attempt (1st = warm intro, 2nd = soft).
        // Custom message_override (used by the contextualized 2nd relance from
        // closing-cron) wins over the configured templates.
        const isSecond = (item.attempt_number || 1) >= 2
        let template = item.message_override
          || (isSecond ? config.message_template_second : config.message_template)
          || config.message_template
          || 'שלום, ראינו שהתקשרת אלינו. איך נוכל לעזור?'

        // Look up the original call timestamp for {time_ago}
        let callDate = null
        if (item.call_id) {
          const { data: call } = await supabase
            .from('calls').select('start_call').eq('id', item.call_id).maybeSingle()
          callDate = call?.start_call || null
        }

        const message = expandTemplate(template, {
          source: item.source_user_name,
          callDate,
        })

        // Send via Chatwoot → channel callback → Unipile (single path, no double send).
        // If Chatwoot inbox is configured, let the channel callback handle WhatsApp delivery.
        const callMeta = {
          source: item.source_user_name || null,
          maskyoo_number: item.source_cdr_ddi || null,
          followup: true,
          followup_attempt: item.attempt_number || 1,
        }
        let chatwootConversationId = null
        if (chatwootAccountId && chatwootInboxId && accessToken) {
          chatwootConversationId = await createChatwootConversation(
            chatwootAccountId, chatwootInboxId, accessToken, item.phone, message, callMeta,
          )
        } else {
          await sendMessage(config.whatsapp_account_id, item.phone, message)
        }

        await supabase
          .from('followup_queue')
          .update({
            status: 'sent',
            result: 'Message sent',
            processed_at: new Date().toISOString(),
            message_sent: message,
            chatwoot_conversation_id: chatwootConversationId,
          })
          .eq('id', item.id)

        console.log(`[Followup Cron] Sent attempt #${item.attempt_number || 1} to ${item.phone}`)
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
  return conversationId
}

// ============================================================================
// Reply / lead tracking — fills replied_at and lead_id on already-sent items.
// Without this, the funnel is unmeasurable (the previous diagnostic had to do
// fuzzy phone-window joins after the fact). With it, the 2nd-attempt scheduler
// has a clean signal: replied_at IS NULL AND lead_id IS NULL = unanswered.
// ============================================================================

async function markRepliesAndConversions(supabase) {
  // Sent items missing reply tracking (only attempt #1 — for #2 we just measure
  // converted-or-not, since there's no #3).
  const { data: sentItems } = await supabase
    .from('followup_queue')
    .select('id, phone, processed_at, chatwoot_conversation_id, lead_id, replied_at, user_id')
    .eq('status', 'sent')
    .or('replied_at.is.null,lead_id.is.null')
    .gte('processed_at', new Date(Date.now() - 7 * 86400000).toISOString())
    .limit(500)

  if (!sentItems?.length) return

  for (const item of sentItems) {
    const updates = {}

    // Reply detection: any inbound message in the chatwoot conversation we created.
    if (!item.replied_at && item.chatwoot_conversation_id) {
      const { data: replyMsgs } = await supabase
        .from('conversation_messages')
        .select('created_at, sessions!inner(chatwoot_conversation_id)')
        .eq('role', 'user')
        .eq('sessions.chatwoot_conversation_id', item.chatwoot_conversation_id)
        .gte('created_at', item.processed_at)
        .order('created_at', { ascending: true })
        .limit(1)
      if (replyMsgs?.length) updates.replied_at = replyMsgs[0].created_at
    }

    // Lead conversion: phone match on any tenant (cross-tenant by design — the
    // session is owned by the bot user but the lead lands under the customer
    // tenant, e.g. user_id=2 for Babait).
    if (!item.lead_id && item.processed_at) {
      const { data: leads } = await supabase
        .from('leads')
        .select('id, updated_at')
        .eq('phone', item.phone)
        .gte('updated_at', item.processed_at)
        .lte('updated_at', new Date(new Date(item.processed_at).getTime() + 30 * 86400000).toISOString())
        .order('updated_at', { ascending: true })
        .limit(1)
      if (leads?.length) updates.lead_id = leads[0].id
    }

    if (Object.keys(updates).length > 0) {
      await supabase.from('followup_queue').update(updates).eq('id', item.id)
    }
  }
}

// ============================================================================
// 2nd-attempt scheduler — for sent 1st attempts older than the configured window
// with no reply and no lead, queue a softer "no-pressure" attempt. The send
// loop picks the appropriate template based on attempt_number.
// ============================================================================

async function enqueueSecondAttempts(supabase) {
  const hours = parseInt(getSetting('FOLLOWUP_SECOND_ATTEMPT_HOURS')) || 24
  const cutoff = new Date(Date.now() - hours * 3600 * 1000).toISOString()

  const { data: candidates } = await supabase
    .from('followup_queue')
    .select('id, user_id, org_id, phone, call_id, source_user_name, source_cdr_ddi')
    .eq('status', 'sent')
    .eq('attempt_number', 1)
    .is('replied_at', null)
    .is('lead_id', null)
    .lte('processed_at', cutoff)
    .limit(50)

  if (!candidates?.length) return

  // Skip phones that already have a 2nd attempt queued (any status — once is enough).
  const phones = candidates.map(c => c.phone)
  const { data: existing } = await supabase
    .from('followup_queue')
    .select('phone')
    .in('phone', phones)
    .gte('attempt_number', 2)
  const skip = new Set((existing || []).map(r => r.phone))

  const toInsert = candidates.filter(c => !skip.has(c.phone)).map(c => ({
    user_id: c.user_id,
    org_id: c.org_id,
    phone: c.phone,
    call_id: c.call_id,
    source_user_name: c.source_user_name,
    source_cdr_ddi: c.source_cdr_ddi,
    scheduled_at: new Date().toISOString(),
    status: 'pending',
    attempt_number: 2,
    parent_id: c.id,
  }))

  if (toInsert.length) {
    await supabase.from('followup_queue').insert(toInsert)
    console.log(`[Followup Cron] Scheduled ${toInsert.length} 2nd-attempt follow-ups`)
  }
}

/**
 * Public helper used by closing-cron when a session ended mid-conversation
 * without enough info to create a lead. Lets us queue a contextualized 2nd
 * attempt with an LLM-generated message tailored to the partial chat.
 */
export async function queueContextualSecondAttempt(supabase, { userId, orgId, phone, callId, sourceUserName, sourceCdrDdi, message }) {
  // Don't create a duplicate if any 2nd attempt already exists for this phone.
  const { data: existing } = await supabase
    .from('followup_queue')
    .select('id')
    .eq('phone', phone)
    .gte('attempt_number', 2)
    .limit(1)
  if (existing?.length) return null

  const { data, error } = await supabase
    .from('followup_queue')
    .insert({
      user_id: userId,
      org_id: orgId || null,
      phone,
      call_id: callId || null,
      source_user_name: sourceUserName || null,
      source_cdr_ddi: sourceCdrDdi || null,
      scheduled_at: new Date().toISOString(),
      status: 'pending',
      attempt_number: 2,
      message_override: message || null,
    })
    .select('id')
    .single()
  if (error) {
    console.error('[Followup Cron] queueContextualSecondAttempt failed:', error.message)
    return null
  }
  return data.id
}
