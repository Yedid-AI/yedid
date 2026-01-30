import { Router } from 'express'
import { checkRole } from '../middleware.js'
import { processSource } from '../ingestion.js'

const router = Router()

// GET /api/sources
router.get('/sources', checkRole('admin'), async (req, res) => {
  try {
    const { data, error } = await req.supabase
      .from('sources')
      .select('*')
      .eq('user_id', req.user.user_id)
      .order('created_at', { ascending: false })

    if (error) throw error
    res.json({ sources: data })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/sources (file upload or URL)
router.post('/sources', checkRole('admin'), async (req, res) => {
  try {
    const { type, name, url } = req.body

    if (!type || !name) {
      return res.status(400).json({ error: 'Type et nom requis' })
    }

    if (type === 'webpage' && !url) {
      return res.status(400).json({ error: 'URL requise pour une page web' })
    }

    const { data: source, error } = await req.supabase
      .from('sources')
      .insert({
        user_id: req.user.user_id,
        type,
        name,
        url: url || null,
        status: 'pending',
      })
      .select()
      .single()

    if (error) throw error

    // Process async - don't await
    let fileBuffer = null
    if (type === 'file' && req.body.file_base64) {
      fileBuffer = Buffer.from(req.body.file_base64, 'base64')
    }

    processSource(source, req.supabaseAdmin || req.supabase, fileBuffer)

    res.status(201).json({ source })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/sources/:id
router.delete('/sources/:id', checkRole('admin'), async (req, res) => {
  try {
    const { id } = req.params

    // Verify ownership
    const { data: source, error: fetchError } = await req.supabase
      .from('sources')
      .select('id, user_id')
      .eq('id', id)
      .eq('user_id', req.user.user_id)
      .single()

    if (fetchError || !source) {
      return res.status(404).json({ error: 'Source introuvable' })
    }

    // Delete vectors from vector_store
    const supabase = req.supabaseAdmin || req.supabase
    await supabase
      .from('vector_store')
      .delete()
      .filter('metadata->>source_id', 'eq', String(id))

    // Delete source
    const { error } = await req.supabase
      .from('sources')
      .delete()
      .eq('id', id)

    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
