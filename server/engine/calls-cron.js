/**
 * Calls Cron — Automatically syncs call data from Maskyoo into Supabase.
 *
 * Schedule: runs every 10 minutes.
 * Fetches the last 24h of CDR data and upserts into the calls table.
 */

import cron from 'node-cron'
import { queryCdr } from '../maskyoo.js'
import { getSetting } from '../settings.js'
import { normalizePhone } from '../normalize-service.js'

let cronTask = null

export function startCallsCron(supabase) {
  if (!supabase) return

  // Only start if Maskyoo is configured
  const apiUrl = getSetting('MASKYOO_API_URL')
  const token = getSetting('MASKYOO_API_TOKEN')
  if (!apiUrl || !token) {
    console.log('[Calls Cron] Skipped — Maskyoo not configured')
    return
  }

  // Every 10 minutes
  cronTask = cron.schedule('* * * * *', () => {
    runCallsSync(supabase).catch((err) => {
      console.error('[Calls Cron] Sync error:', err.message)
    })
  })

  console.log('[Calls Cron] Started — every minute')

  // Run once immediately on startup
  runCallsSync(supabase).catch((err) => {
    console.error('[Calls Cron] Initial sync error:', err.message)
  })
}

export function stopCallsCron() {
  if (cronTask) {
    cronTask.stop()
    cronTask = null
    console.log('[Calls Cron] Stopped')
  }
}

async function runCallsSync(supabase) {
  const apiUrl = getSetting('MASKYOO_API_URL')
  const token = getSetting('MASKYOO_API_TOKEN')
  if (!apiUrl || !token) return

  // Fetch last 24h of data (Maskyoo timestamps are Israel local time)
  const now = new Date()
  const from = new Date(now)
  from.setHours(from.getHours() - 24)

  const dateFrom = toIsraelString(from)
  const dateTo = toIsraelString(now)

  const sql = `SELECT * FROM webserviceview WHERE start_call >= '${dateFrom}' AND start_call <= '${dateTo}' ORDER BY start_call DESC LIMIT 5000`

  let data
  try {
    data = await queryCdr(sql)
  } catch (err) {
    console.error('[Calls Cron] Maskyoo query failed:', err.message)
    return
  }

  if (!Array.isArray(data) || data.length === 0) {
    console.log('[Calls Cron] No calls returned from Maskyoo (empty result)')
    return
  }

  console.log(`[Calls Cron] Fetched ${data.length} calls from Maskyoo`)

  // Pick the first super_admin as the owner (shared Maskyoo account → store once)
  const { data: owner, error: ownerErr } = await supabase
    .from('users')
    .select('id')
    .eq('role', 'super_admin')
    .limit(1)
    .maybeSingle()

  if (ownerErr || !owner) return

  const batch = data.map(row => {
    let metaData = row.cdr_meta_data || null
    if (typeof metaData === 'string') {
      try { metaData = JSON.parse(metaData) } catch { /* keep as-is */ }
    }
    return {
      user_id: owner.id,
      cdr_uniqueid: row.cdr_uniqueid || row.id || `unknown_${Date.now()}_${Math.random()}`,
      start_call: row.start_call || null,
      end_call: row.end_call || null,
      call_duration: Number(row.call_duration) || 0,
      cdr_ani: normalizePhone(row.cdr_ani) || row.cdr_ani || null,
      cdr_ddi: row.cdr_ddi || null,
      user_phone: normalizePhone(row.user_phone) || row.user_phone || null,
      user_name: row.user_name || null,
      call_status: row.call_status || null,
      onetouch: row.onetouch || null,
      gclid: row.gclid || null,
      cdr_meta_data: metaData,
      raw_data: row,
      synced_at: new Date().toISOString(),
    }
  })

  let synced = 0
  for (let i = 0; i < batch.length; i += 500) {
    const chunk = batch.slice(i, i + 500)
    const { error } = await supabase
      .from('calls')
      .upsert(chunk, { onConflict: 'user_id,cdr_uniqueid' })

    if (error) {
      console.error(`[Calls Cron] Upsert error:`, error.message)
    } else {
      synced += chunk.length
    }
  }

  if (synced > 0) {
    console.log(`[Calls Cron] Synced ${synced} calls`)
  }
}

// Maskyoo timestamps are in Asia/Jerusalem — format dates accordingly
function toIsraelString(date) {
  return date.toLocaleString('sv-SE', { timeZone: 'Asia/Jerusalem' })
}
