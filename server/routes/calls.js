import { Router } from 'express'
import { checkRole } from '../middleware.js'
import { queryCdr, getRecording, getCallMetadata } from '../maskyoo.js'

const router = Router()

// ─── GET /calls — read from Supabase (fast) ─────────────
router.get('/calls', checkRole('admin'), async (req, res) => {
  try {
    const { date_from, date_to, page = 0, page_size = 50, search } = req.query
    const limit = Math.min(Number(page_size) || 50, 200)
    const offset = (Number(page) || 0) * limit
    const userId = req.user.user_id

    // Build Supabase query
    let query = req.supabaseAdmin.from('calls').select('*', { count: 'exact' })

    if (req.user.role !== 'super_admin') {
      query = query.eq('user_id', userId)
    }

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
    }))

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

    // Build date range: last N days
    const now = new Date()
    const from = new Date(now)
    from.setDate(from.getDate() - Math.min(Number(days) || 30, 365))

    const dateFrom = from.toISOString().slice(0, 19).replace('T', ' ')
    const dateTo = now.toISOString().slice(0, 19).replace('T', ' ')

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
      const batch = data.slice(i, i + 500).map(row => ({
        user_id: userId,
        cdr_uniqueid: row.cdr_uniqueid || row.id || `unknown_${i}_${Math.random()}`,
        start_call: row.start_call || null,
        end_call: row.end_call || null,
        call_duration: Number(row.call_duration) || 0,
        cdr_ani: row.cdr_ani || null,
        cdr_ddi: row.cdr_ddi || null,
        user_phone: row.user_phone || null,
        user_name: row.user_name || null,
        call_status: row.call_status || null,
        onetouch: row.onetouch || null,
        raw_data: row,
        synced_at: new Date().toISOString(),
      }))

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
    const userId = req.user.user_id
    let query = req.supabaseAdmin.from('calls').select('synced_at', { count: 'exact' })
    if (req.user.role !== 'super_admin') {
      query = query.eq('user_id', userId)
    }
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

// ─── GET /calls/:uuid/recording — live from Maskyoo ─────
router.get('/calls/:uuid/recording', checkRole('admin'), async (req, res) => {
  try {
    const data = await getRecording(req.params.uuid, req.query.type || 'mp3')
    res.json(data)
  } catch (err) {
    console.error('[calls] Recording error:', err.message)
    res.status(502).json({ error: err.message })
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

export default router
