import { Router } from 'express'
import { queryCdr, queryByDateRange, getRecording, getCallMetadata } from '../maskyoo.js'

const router = Router()

// GET /calls — fetch calls from Maskyoo with optional date filters
router.get('/calls', async (req, res) => {
  try {
    const { date_from, date_to, page = 0, page_size = 50, search } = req.query
    const limit = Math.min(Number(page_size) || 50, 200)
    const offset = (Number(page) || 0) * limit

    // Build SQL query — SELECT * to capture all available columns
    let where = ''
    const conditions = []

    if (date_from) {
      conditions.push(`start_call >= '${date_from.replace(/'/g, '')}'`)
    }
    if (date_to) {
      conditions.push(`start_call <= '${date_to.replace(/'/g, '')}'`)
    }
    if (search) {
      const s = search.replace(/'/g, '')
      conditions.push(`(cdr_ani LIKE '%${s}%' OR cdr_ddi LIKE '%${s}%' OR user_phone LIKE '%${s}%' OR user_name LIKE '%${s}%')`)
    }

    if (conditions.length > 0) {
      where = ` WHERE ${conditions.join(' AND ')}`
    }

    const sql = `SELECT * FROM webserviceview${where} ORDER BY start_call DESC LIMIT ${limit} OFFSET ${offset}`
    const data = await queryCdr(sql)

    // Also get total count for pagination
    const countSql = `SELECT COUNT(*) as total FROM webserviceview${where}`
    let total = 0
    try {
      const countData = await queryCdr(countSql)
      if (Array.isArray(countData) && countData[0]?.total) {
        total = Number(countData[0].total)
      }
    } catch {
      // If count query fails, estimate from result length
      total = Array.isArray(data) ? (data.length === limit ? (offset + limit + 1) : (offset + data.length)) : 0
    }

    res.json({
      calls: Array.isArray(data) ? data : [],
      total,
      page: Number(page) || 0,
      page_size: limit,
    })
  } catch (err) {
    console.error('[calls] Error:', err.message)
    res.status(502).json({ error: err.message })
  }
})

// GET /calls/:uuid/recording — get call recording URL
router.get('/calls/:uuid/recording', async (req, res) => {
  try {
    const data = await getRecording(req.params.uuid, req.query.type || 'mp3')
    res.json(data)
  } catch (err) {
    console.error('[calls] Recording error:', err.message)
    res.status(502).json({ error: err.message })
  }
})

// GET /calls/:uuid/metadata — get call metadata
router.get('/calls/:uuid/metadata', async (req, res) => {
  try {
    const data = await getCallMetadata(req.params.uuid)
    res.json(data)
  } catch (err) {
    console.error('[calls] Metadata error:', err.message)
    res.status(502).json({ error: err.message })
  }
})

export default router
