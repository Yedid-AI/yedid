/**
 * Dispatch Queue Cron — replays leads that were parked at status='queued_for_dispatch'
 * because they were created outside the dispatch schedule window.
 *
 * Without this, those leads stay queued forever and never reach the branch.
 *
 * Schedule: every 5 minutes. Each cycle picks up to 50 queued leads, evaluates each
 * against its owner's dispatch_config schedule, and dispatches the ones that are now in window.
 */

import cron from 'node-cron'
import { dispatchLead } from '../routes/leads.js'

let cronTask = null
let running = false

export function startDispatchQueueCron(supabase) {
  if (!supabase) return

  cronTask = cron.schedule('*/5 * * * *', () => {
    runCycle(supabase).catch((err) => {
      console.error('[Dispatch Queue Cron] Error:', err.message)
    })
  })

  console.log('[Dispatch Queue Cron] Started — every 5 minutes')
}

export function stopDispatchQueueCron() {
  if (cronTask) {
    cronTask.stop()
    cronTask = null
    console.log('[Dispatch Queue Cron] Stopped')
  }
}

async function runCycle(supabase) {
  if (running) return
  running = true
  try {
    const { data: leads, error } = await supabase
      .from('leads')
      .select('*')
      .eq('status', 'queued_for_dispatch')
      .order('updated_at', { ascending: true })
      .limit(50)

    if (error) {
      console.error('[Dispatch Queue Cron] Fetch error:', error.message)
      return
    }
    if (!leads?.length) return

    let dispatched = 0
    let stillQueued = 0
    let failed = 0

    for (const lead of leads) {
      try {
        const result = await dispatchLead(supabase, lead)
        if (result.success) dispatched++
        else if (result.queued) stillQueued++
        else {
          failed++
          console.warn(`[Dispatch Queue Cron] Lead ${lead.id} not dispatched: ${result.error}`)
        }
      } catch (err) {
        failed++
        console.error(`[Dispatch Queue Cron] Lead ${lead.id} threw:`, err.message)
      }
    }

    if (dispatched || failed) {
      console.log(`[Dispatch Queue Cron] dispatched=${dispatched} still_queued=${stillQueued} failed=${failed}`)
    }
  } finally {
    running = false
  }
}
