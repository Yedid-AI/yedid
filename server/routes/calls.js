import crypto from 'crypto'
import { Router } from 'express'
import { checkRole } from '../middleware.js'
import { queryCdr, getCallMetadata, getRecordingUrl } from '../maskyoo.js'
import { normalizePhone } from '../normalize-service.js'

function deterministicId(row) {
  const key = `${row.start_call || ''}_${row.cdr_ani || ''}_${row.cdr_ddi || ''}_${row.call_duration || ''}`
  return 'gen_' + crypto.createHash('md5').update(key).digest('hex').slice(0, 16)
}

const router = Router()

// ─── GET /calls — read from Supabase (fast) ─────────────
router.get('/calls', checkRole('admin'), async (req, res) => {
  try {
    const { date_from, date_to, page = 0, page_size = 50, search } = req.query
    const limit = Math.min(Number(page_size) || 50, 200)
    const offset = (Number(page) || 0) * limit

    // Calls are shared (single Maskyoo account) — all admin+ see all calls
    let query = req.supabaseAdmin.from('calls').select('*', { count: 'exact' })

    if (date_from) query = query.gte('start_call', date_from)
    if (date_to) query = query.lte('start_call', date_to)
    if (search) {
      query = query.or(`cdr_ani.ilike.%${search}%,cdr_ddi.ilike.%${search}%,user_phone.ilike.%${search}%,user_name.ilike.%${search}%`)
    }

    query = query.order('start_call', { ascending: false }).range(offset, offset + limit - 1)

    const { data, count, error } = await query
    if (error) throw error

    // Return raw_data merged with indexed fields for the frontend
    const calls = (data || []).map(row => ({
      ...row.raw_data,
      id: row.id,
      cdr_uniqueid: row.cdr_uniqueid,
      start_call: row.start_call,
      end_call: row.end_call,
      call_duration: row.call_duration,
      cdr_ani: row.cdr_ani,
      cdr_ddi: row.cdr_ddi,
      user_phone: row.user_phone,
      user_name: row.user_name,
      call_status: row.call_status,
      onetouch: row.onetouch,
      gclid: row.gclid,
      cdr_meta_data: row.cdr_meta_data,
    }))

    // Enrich with lead info (match cdr_ani → leads.phone)
    const phones = [...new Set(calls.map(c => c.cdr_ani).filter(Boolean))]
    if (phones.length > 0) {
      const { data: leadRows } = await req.supabaseAdmin
        .from('leads')
        .select('id, name, phone')
        .in('phone', phones)
      if (leadRows?.length) {
        const phoneToLead = {}
        for (const l of leadRows) {
          if (!phoneToLead[l.phone]) phoneToLead[l.phone] = l
        }
        for (const call of calls) {
          const lead = phoneToLead[call.cdr_ani]
          if (lead) {
            call.lead_id = lead.id
            call.lead_name = lead.name
          }
        }
      }
    }

    res.json({
      calls,
      total: count || 0,
      page: Number(page) || 0,
      page_size: limit,
    })
  } catch (err) {
    console.error('[calls] Error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ─── POST /calls/sync — fetch from Maskyoo & upsert into Supabase ───
router.post('/calls/sync', checkRole('admin'), async (req, res) => {
  try {
    const userId = req.user.user_id
    const { days = 30 } = req.body

    // Build date range: last N days (Maskyoo timestamps are Israel local time)
    const now = new Date()
    const from = new Date(now)
    from.setDate(from.getDate() - Math.min(Number(days) || 30, 365))

    const dateFrom = toIsraelString(from)
    const dateTo = toIsraelString(now)

    console.log(`[calls/sync] Syncing ${days} days for user ${userId}: ${dateFrom} → ${dateTo}`)

    // Fetch all records from Maskyoo (paginated with large limit)
    const sql = `SELECT * FROM webserviceview WHERE start_call >= '${dateFrom}' AND start_call <= '${dateTo}' ORDER BY start_call DESC LIMIT 10000`
    const data = await queryCdr(sql)

    if (!Array.isArray(data) || data.length === 0) {
      return res.json({ synced: 0, message: 'Aucun appel trouve sur cette periode' })
    }

    console.log(`[calls/sync] Fetched ${data.length} records from Maskyoo`)

    // Upsert into Supabase in batches of 500
    let synced = 0
    const errors = []

    for (let i = 0; i < data.length; i += 500) {
      const batch = data.slice(i, i + 500).map(row => {
        let metaData = row.cdr_meta_data || null
        if (typeof metaData === 'string') {
          try { metaData = JSON.parse(metaData) } catch { /* keep as-is */ }
        }
        return {
        user_id: userId,
        cdr_uniqueid: row.cdr_uniqueid || row.id || deterministicId(row),
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
      }})

      const { error: upsertError } = await req.supabaseAdmin
        .from('calls')
        .upsert(batch, { onConflict: 'user_id,cdr_uniqueid' })

      if (upsertError) {
        console.error(`[calls/sync] Batch ${Math.floor(i / 500)} error:`, upsertError.message)
        errors.push(upsertError.message)
      } else {
        synced += batch.length
      }
    }

    console.log(`[calls/sync] Done: ${synced} synced, ${errors.length} errors`)
    res.json({ synced, total_fetched: data.length, errors })
  } catch (err) {
    console.error('[calls/sync] Error:', err.message)
    res.status(502).json({ error: err.message })
  }
})

// ─── GET /calls/sync/status — check last sync info ──────
router.get('/calls/sync/status', checkRole('admin'), async (req, res) => {
  try {
    let query = req.supabaseAdmin.from('calls').select('synced_at', { count: 'exact' })
    query = query.order('synced_at', { ascending: false }).limit(1)

    const { data, count, error } = await query
    if (error) throw error

    res.json({
      total_calls: count || 0,
      last_synced: data?.[0]?.synced_at || null,
    })
  } catch (err) {
    console.error('[calls/sync/status]', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ─── GET /calls/:uuid/recording — proxy MP3 from Maskyoo ─────
router.get('/calls/:uuid/recording', checkRole('admin'), async (req, res) => {
  try {
    const url = getRecordingUrl(req.params.uuid, req.query.type || 'mp3')

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30_000)

    const upstream = await fetch(url.url, {
      headers: { 'Authorization': `Bearer ${url.token}` },
      signal: controller.signal,
    })
    clearTimeout(timeout)

    const contentType = upstream.headers.get('content-type') || ''

    // If Maskyoo returns JSON, it's an error (e.g. 3002 = no recording)
    if (contentType.includes('json') || contentType.includes('text')) {
      const text = await upstream.text()
      try {
        const json = JSON.parse(text)
        if (json.status?.code && json.status.code !== 200) {
          return res.status(404).json({ error: json.status.description || 'Recording not available' })
        }
        return res.json(json)
      } catch {
        return res.status(404).json({ error: 'No recording available' })
      }
    }

    // Binary audio — proxy to client
    res.setHeader('Content-Type', contentType || 'audio/mpeg')
    if (upstream.headers.get('content-length')) {
      res.setHeader('Content-Length', upstream.headers.get('content-length'))
    }
    res.setHeader('Accept-Ranges', 'bytes')

    // Stream the response body
    const reader = upstream.body.getReader()
    const pump = async () => {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        res.write(value)
      }
      res.end()
    }
    await pump()
  } catch (err) {
    console.error('[calls] Recording error:', err.message)
    if (!res.headersSent) {
      res.status(502).json({ error: err.message })
    }
  }
})

// ─── GET /calls/:uuid/metadata — live from Maskyoo ──────
router.get('/calls/:uuid/metadata', checkRole('admin'), async (req, res) => {
  try {
    const data = await getCallMetadata(req.params.uuid)
    res.json(data)
  } catch (err) {
    console.error('[calls] Metadata error:', err.message)
    res.status(502).json({ error: err.message })
  }
})

// Maskyoo timestamps are in Asia/Jerusalem — format dates accordingly
function toIsraelString(date) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  const parts = {}
  for (const { type, value } of fmt.formatToParts(date)) {
    parts[type] = value
  }
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`
}

export default router
