/**
 * Follow-up Cron — Processes the followup queue.
 *
 * Every minute:
 *   1. Enqueue: check recent calls against active followup configs
 *   2. Process: for pending items past their scheduled_at, check if phone is in leads
 *      - If in leads → mark skipped
 *      - If NOT in leads → send WhatsApp message → mark sent/failed
 */

import cron from 'node-cron'
import { sendMessage } from '../unipile.js'
import { normalizePhone } from '../normalize-service.js'

let cronTask = null

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
  // Step 1: Enqueue new calls
  await enqueueNewCalls(supabase)

  // Step 2: Process pending queue items
  await processQueue(supabase)
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

    // Check which phones are already queued (avoid duplicates)
    const phones = [...new Set(matchingCalls.map(c => c.cdr_ani).filter(Boolean))]
    const { data: existingQueue } = await supabase
      .from('followup_queue')
      .select('phone')
      .eq('user_id', config.user_id)
      .in('phone', phones)
      .in('status', ['pending', 'sent'])

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
    // Load the user's followup config
    const { data: config } = await supabase
      .from('followup_config')
      .select('*')
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

    for (const item of items) {
      if (leadPhones.has(item.phone)) {
        // Phone found in leads — skip
        await supabase
          .from('followup_queue')
          .update({ status: 'skipped', result: 'Already in leads', processed_at: now })
          .eq('id', item.id)
        continue
      }

      // Not in leads — send WhatsApp message
      try {
        const message = config.message_template || 'שלום, ראינו שהתקשרת אלינו. איך נוכל לעזור?'
        await sendMessage(config.whatsapp_account_id, item.phone, message)

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
