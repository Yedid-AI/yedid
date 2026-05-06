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
import { sendNativeMessage } from './native-messaging.js'
import { processAudioPipeline } from './audio-pipeline.js'

// Calls under this many seconds are considered "missed" — even if Maskyoo
// reports them as 'answered' (typically a musical voicemail picking up).
// Calls >= this threshold are treated as real conversations and routed to
// the audio pipeline instead of the WhatsApp follow-up.
const MISSED_CALL_MAX_DURATION_SEC = 60

// How long to wait before allowing another follow-up to the same phone
// (lifts the previous "send once and never again" dedup so a prospect who
// calls back days later can be re-relancé). Configurable via env.
function relanceCooldownMs() {
  const hours = parseInt(getSetting('FOLLOWUP_RELANCE_COOLDOWN_HOURS')) || 24
  return hours * 3600 * 1000
}

// Kill-switch (cf. routes/whatsapp.js)
function isNativeChatEnabledFor(unipileAccountId) {
  const enabled = String(process.env.NATIVE_CHAT_ENABLED || '').toLowerCase() === 'true'
  if (!enabled) return false
  const whitelist = (process.env.NATIVE_CHAT_INBOXES || '').split(',').map(s => s.trim()).filter(Boolean)
  if (whitelist.length === 0) return true
  return whitelist.includes(unipileAccountId)
}

// Best-effort mapping from a Maskyoo source line name to the spoken topic to
// inject into the relance message. The template embeds this as " (בנוגע ל...)"
// after the branch name. If no match, we just say nothing — better silence than
// a wrong topic.
const TOPIC_BY_SOURCE_HINT = [
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

    // Step 5: Audio pipeline — for long-answered calls without a logged lead,
    // transcribe and analyze to surface a CRM entry. Gated by AUDIO_PIPELINE_ENABLED.
    try {
      await processAudioPipeline(supabase)
    } catch (err) {
      console.error('[Followup Cron] audio pipeline error:', err.message)
    }
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

    // Only short calls go to the WhatsApp follow-up queue. Calls with
    // call_duration >= MISSED_CALL_MAX_DURATION_SEC are real conversations
    // that the audio-pipeline handles separately (transcribe + LLM → lead).
    const { data: recentCalls, error: callsErr } = await supabase
      .from('calls')
      .select('id, cdr_ani, user_name, cdr_ddi, start_call, call_duration')
      .gte('start_call', since)
      .lt('call_duration', MISSED_CALL_MAX_DURATION_SEC)
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

    // Cooldown dedup: skip phones we already relanced within the cooldown
    // window. Without the date filter a phone enqueued months ago would
    // permanently block any new follow-up — even after a fresh callback.
    const phones = [...new Set(
      matchingCalls.map(c => normalizePhone(c.cdr_ani)).filter(Boolean)
    )]
    const cooldownCutoff = new Date(Date.now() - relanceCooldownMs()).toISOString()
    const { data: existingQueue } = phones.length ? await supabase
      .from('followup_queue')
      .select('phone')
      .eq('user_id', config.user_id)
      .in('phone', phones)
      .gte('created_at', cooldownCutoff) : { data: [] }

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
    // Window matches the relance cooldown so that a callback after the cooldown re-opens follow-up.
    const phones = items.map(i => i.phone)
    const cooldownCutoffSend = new Date(Date.now() - relanceCooldownMs()).toISOString()
    const { data: leads } = await supabase
      .from('leads')
      .select('phone, status')
      .in('phone', phones)
      .gte('updated_at', cooldownCutoffSend)

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

        const callMeta = {
          source: item.source_user_name || null,
          maskyoo_number: item.source_cdr_ddi || null,
          followup: true,
          followup_attempt: item.attempt_number || 1,
        }

        // Native path active si NATIVE_CHAT_ENABLED + chat_inbox existe pour ce compte
        const useNative = isNativeChatEnabledFor(config.whatsapp_account_id)
        let nativeConversationId = null
        let chatwootConversationId = null

        if (useNative) {
          nativeConversationId = await sendNativeFollowup(supabase, {
            userId,
            unipileAccountId: config.whatsapp_account_id,
            phone: item.phone,
            message,
            callMeta,
          })
        }

        if (!nativeConversationId) {
          if (useNative) {
            // Native est cense gerer cet account_id (kill-switch ON, eventuellement
            // dans la whitelist) mais sendNativeFollowup a renvoye null —
            // typiquement chat_inbox manquant pour ce unipile_account_id.
            // On refuse le fire-and-forget Unipile (cf. bug observe sur 41% des
            // relances 28-29/04 envoyees sans aucun trace en DB).
            // Le catch outer marquera l'item 'failed' avec ce message — la queue
            // retentera et un humain peut investiguer le chat_inbox manquant.
            throw new Error(`Native chat enabled but sendNativeFollowup returned null (unipile_account=${config.whatsapp_account_id}). chat_inbox introuvable ou erreur INSERT — verifier chat_inboxes pour ce compte.`)
          }
          // Fallback Chatwoot (kill-switch off uniquement)
          if (chatwootAccountId && chatwootInboxId && accessToken) {
            chatwootConversationId = await createChatwootConversation(
              chatwootAccountId, chatwootInboxId, accessToken, item.phone, message, callMeta,
            )
          } else {
            // Last resort fire-and-forget — uniquement quand useNative=false ET
            // pas de Chatwoot configure. Trace minimaliste mais au moins le
            // message part (legacy preserve).
            console.warn(`[Followup Cron] Fire-and-forget Unipile pour ${item.phone} (ni native, ni Chatwoot) — pas de tracking`)
            await sendMessage(config.whatsapp_account_id, item.phone, message)
          }
        }

        await supabase
          .from('followup_queue')
          .update({
            status: 'sent',
            result: 'Message sent',
            processed_at: new Date().toISOString(),
            message_sent: message,
            chatwoot_conversation_id: chatwootConversationId,
            conversation_id: nativeConversationId,
          })
          .eq('id', item.id)

        console.log(`[Followup Cron] Sent attempt #${item.attempt_number || 1} to ${item.phone} via ${nativeConversationId ? 'native' : 'chatwoot'}`)
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
    .select('id, phone, processed_at, chatwoot_conversation_id, conversation_id, lead_id, replied_at, user_id')
    .eq('status', 'sent')
    .or('replied_at.is.null,lead_id.is.null')
    .gte('processed_at', new Date(Date.now() - 7 * 86400000).toISOString())
    .limit(500)

  if (!sentItems?.length) return

  for (const item of sentItems) {
    const updates = {}

    // Reply detection: any inbound contact message after processed_at.
    // Native: check chat_messages on conversation_id.
    // Legacy Chatwoot: check conversation_messages joined on sessions.chatwoot_conversation_id.
    if (!item.replied_at && item.conversation_id) {
      const { data: nativeReplies } = await supabase
        .from('chat_messages')
        .select('created_at')
        .eq('conversation_id', item.conversation_id)
        .eq('sender_type', 'contact')
        .gte('created_at', item.processed_at)
        .order('created_at', { ascending: true })
        .limit(1)
      if (nativeReplies?.length) updates.replied_at = nativeReplies[0].created_at
    }
    if (!updates.replied_at && !item.replied_at && item.chatwoot_conversation_id) {
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
  // Lower bound: 1st attempt must be at least FOLLOWUP_SECOND_ATTEMPT_HOURS old
  // (let the user breathe before nagging). Upper bound: hard 7 days — relancing
  // someone whose original call is a month old feels like cold spam, not a
  // follow-up. Without the upper bound the very first cron cycle after the
  // 034 schema rollout queued attempts for 33+-day-old originals.
  const hours = parseInt(getSetting('FOLLOWUP_SECOND_ATTEMPT_HOURS')) || 24
  const oldCutoff = new Date(Date.now() - hours * 3600 * 1000).toISOString()
  const recentCutoff = new Date(Date.now() - 7 * 86400000).toISOString()

  const { data: candidates } = await supabase
    .from('followup_queue')
    .select('id, user_id, org_id, phone, call_id, source_user_name, source_cdr_ddi')
    .eq('status', 'sent')
    .eq('attempt_number', 1)
    .is('replied_at', null)
    .is('lead_id', null)
    .lte('processed_at', oldCutoff)
    .gte('processed_at', recentCutoff)
    .limit(50)

  if (!candidates?.length) return

  const phones = [...new Set(candidates.map(c => c.phone))]
  const cooldownCutoff2nd = new Date(Date.now() - relanceCooldownMs()).toISOString()

  // Skip phones that already have a 2nd attempt queued within the cooldown
  // window. Older 2nd attempts no longer permanently block — without this a
  // callback after weeks would never get its own 2nd-attempt cycle.
  const { data: existingAttempts } = await supabase
    .from('followup_queue')
    .select('phone')
    .in('phone', phones)
    .gte('attempt_number', 2)
    .gte('created_at', cooldownCutoff2nd)
  const skipAttempt = new Set((existingAttempts || []).map(r => r.phone))

  // Skip phones with a lead recently touched. Older inactive leads no longer
  // block a fresh 2nd attempt triggered by a new call.
  const { data: existingLeads } = await supabase
    .from('leads')
    .select('phone')
    .in('phone', phones)
    .gte('updated_at', cooldownCutoff2nd)
  const skipLead = new Set((existingLeads || []).map(r => r.phone))

  const toInsert = candidates
    .filter(c => !skipAttempt.has(c.phone) && !skipLead.has(c.phone))
    .map(c => ({
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
    console.log(`[Followup Cron] Scheduled ${toInsert.length} 2nd-attempt follow-ups (skipped ${candidates.length - toInsert.length} due to existing lead/attempt)`)
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

// ============================================================================
// NATIVE FOLLOW-UP (chat_messages + relais Unipile via native-messaging)
// ============================================================================

/**
 * Envoi de relance via le natif: trouve/cree le lead + chat_inbox + chat_conversation,
 * puis INSERT chat_messages (sender_type='bot') qui declenche le relais Unipile.
 *
 * @returns {Promise<string|null>} chat_conversations.id ou null si rien ne s'est passe.
 */
async function sendNativeFollowup(supabase, { userId, unipileAccountId, phone, message, callMeta }) {
  try {
    // 1. Find the chat_inbox bound to this Unipile account
    const { data: inbox } = await supabase
      .from('chat_inboxes')
      .select('id, user_id')
      .eq('unipile_account_id', unipileAccountId)
      .eq('channel_type', 'whatsapp_unipile')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()
    if (!inbox) {
      console.log(`[Followup Cron] No chat_inbox for unipile_account=${unipileAccountId} — falling back to Chatwoot`)
      return null
    }

    // 2. Find or create lead by phone (normalized)
    const normalizedPhone = phone.startsWith('+') ? phone : `+${phone.replace(/^\+?/, '')}`
    let { data: lead } = await supabase
      .from('leads')
      .select('id')
      .eq('user_id', userId)
      .eq('phone', normalizedPhone)
      .limit(1)
      .maybeSingle()
    if (!lead) {
      // Use '' for the stub name — leads.name is NOT NULL but '' is honest
      // (UI falls back to '—'). The previous fallback (name=phone) tricked
      // the AI's contactContext into thinking it already had a name, so the
      // bot never asked — and save_lead never fired. Closing-cron / escalation
      // enrichment fills in the real name once the contact replies.
      const r = await supabase
        .from('leads')
        .insert({
          user_id: userId,
          name: '',
          phone: normalizedPhone,
          source: 'followup',
          lead_channel: 'whatsapp',
          status: 'new',
        })
        .select('id')
        .single()
      if (r.error) throw r.error
      lead = r.data
    }

    // 3. Find or create conversation for this lead+inbox — pas de filtre
    // sur status: un lead = un thread continu (le trigger re-ouvre une conv
    // 'resolved' quand un contact y ecrit).
    let { data: conv } = await supabase
      .from('chat_conversations')
      .select('id')
      .eq('user_id', inbox.user_id)
      .eq('inbox_id', inbox.id)
      .eq('contact_id', lead.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!conv) {
      const r = await supabase
        .from('chat_conversations')
        .insert({
          user_id: inbox.user_id,
          inbox_id: inbox.id,
          contact_id: lead.id,
          channel: 'whatsapp_unipile',
          status: 'open',
          metadata: { followup: true, callMeta },
        })
        .select('id')
        .single()
      if (r.error) throw r.error
      conv = r.data
    }

    // 4. Send the followup message — relay handled by native-messaging
    const result = await sendNativeMessage({
      supabase,
      userId: inbox.user_id,
      conversationId: conv.id,
      senderType: 'bot',
      content: message,
      contentType: 'text',
      metadata: { ...callMeta, source_kind: 'followup' },
    })
    if (result?.error) {
      console.error('[Followup Cron] sendNativeMessage error:', result.error)
      return null
    }

    return conv.id
  } catch (err) {
    console.error('[Followup Cron] sendNativeFollowup failed:', err.message)
    return null
  }
}
