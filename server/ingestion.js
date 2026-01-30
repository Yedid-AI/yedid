import OpenAI from 'openai'
import { getSetting } from './settings.js'

function getOpenAI() {
  const key = getSetting('OPENAI_API_KEY')
  if (!key) {
    throw new Error('OPENAI_API_KEY non configure. Ajoutez-la dans Environnement.')
  }
  return new OpenAI({ apiKey: key })
}

export async function extractText(source, fileBuffer) {
  if (source.type === 'file') {
    const pdfParse = (await import('pdf-parse')).default
    const result = await pdfParse(fileBuffer)
    return result.text
  }

  if (source.type === 'webpage') {
    const firecrawlUrl = getSetting('FIRECRAWL_URL')
    if (!firecrawlUrl) throw new Error('FIRECRAWL_URL non configure. Ajoutez-la dans Environnement.')

    const res = await fetch(`${firecrawlUrl}/v1/scrape`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: source.url, formats: ['markdown'] }),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Firecrawl error: ${err}`)
    }

    const data = await res.json()
    return data.data?.markdown || data.data?.content || ''
  }

  throw new Error(`Type de source non supporte: ${source.type}`)
}

export function chunkText(text, maxTokens = 800) {
  const chunks = []
  const paragraphs = text.split(/\n\s*\n/)
  let current = ''

  for (const para of paragraphs) {
    const trimmed = para.trim()
    if (!trimmed) continue

    const estimatedTokens = (current + '\n\n' + trimmed).length / 4
    if (estimatedTokens > maxTokens && current) {
      chunks.push(current.trim())
      current = trimmed
    } else {
      current = current ? current + '\n\n' + trimmed : trimmed
    }
  }

  if (current.trim()) {
    chunks.push(current.trim())
  }

  return chunks
}

export async function embedAndStore(chunks, metadata, supabase) {
  let stored = 0

  for (const chunk of chunks) {
    const embeddingRes = await getOpenAI().embeddings.create({
      model: 'text-embedding-3-small',
      input: chunk,
    })

    const embedding = embeddingRes.data[0].embedding

    const { error } = await supabase.from('vector_store').insert({
      content: chunk,
      embedding,
      metadata: {
        ...metadata,
        chunk_index: stored,
      },
    })

    if (error) throw error
    stored++
  }

  return stored
}

export async function processSource(source, supabase, fileBuffer) {
  // Update status to processing
  await supabase
    .from('sources')
    .update({ status: 'processing' })
    .eq('id', source.id)

  try {
    const text = await extractText(source, fileBuffer)
    if (!text || text.trim().length === 0) {
      throw new Error('Aucun texte extrait')
    }

    const chunks = chunkText(text)
    const chunkCount = await embedAndStore(
      chunks,
      { source_id: source.id, user_id: source.user_id, source_name: source.name },
      supabase
    )

    await supabase
      .from('sources')
      .update({ status: 'complete', chunk_count: chunkCount })
      .eq('id', source.id)
  } catch (err) {
    await supabase
      .from('sources')
      .update({ status: 'error', error_message: err.message })
      .eq('id', source.id)
  }
}
