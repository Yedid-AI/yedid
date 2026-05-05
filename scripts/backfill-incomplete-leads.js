/**
 * Backfill incomplete leads from native chat conversations.
 *
 * For leads created in the last N days where critical fields (name, city,
 * service_requested, branch) are empty, this script:
 *   1. Pulls the linked native chat conversation
 *   2. Runs LLM extraction over the messages
 *   3. Calls saveLead with source='backfill' (lenient: bypasses strict 4-field
 *      validation, fills only the empty fields, runs Aviezer single-branch
 *      fallback + city→branch index)
 *   4. Logs a bot_transcript activity so the lead card timeline shows the chat
 *
 * Existing data is never overwritten — saveLead's enrich path only updates
 * fields that are currently NULL/empty. If admin@yedid.io already manually
 * filled a field, the backfill leaves it alone.
 *
 * Usage:
 *   node scripts/backfill-incomplete-leads.js              # dry run, last 3 days
 *   node scripts/backfill-incomplete-leads.js --commit     # actually update DB
 *   DAYS=7 node scripts/backfill-incomplete-leads.js --commit
 */
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { createCompletion } from '../server/engine/llm.js'
import { saveLead, logBotTranscript } from '../server/engine/internal-tools.js'
import { loadServiceCache, normalizePhone } from '../server/normalize-service.js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const COMMIT = process.argv.includes('--commit')
const DAYS = Number(process.env.DAYS) || 3

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })

const EXTRACTION_PROMPT = `Extract the contact's intent from the WhatsApp conversation below.
Return ONLY valid JSON:
{"name": "contact's full name (first+last) or null",
 "phone": "phone number in any format the contact mentioned, or null",
 "city": "city or null",
 "service_requested": "main service the contact wants, or null",
 "details": "1-2 sentence summary of the request in Hebrew, or null"}

Rules:
- name: only the contact's own name, never the bot's. Strip honorifics.
- phone: only digits — null if not present.
- city: only if the contact stated it; do NOT infer from a hospital name unless that's the city.
- service_requested: short canonical phrase from this list (return the closest match in Hebrew):
   "מטפל/ת", "עובד זר", "אחות פרטית", "השגחה בבית חולים", "שירות פרטי", "יעוץ", "שירות אמבולנס", "מחפש עבודה"
   For Shiba Hospital ("שיבא"/"שיבה") with a private nurse request → "אחות פרטית". For a foreign worker request → "עובד זר". For a private caregiver / help at home → "מטפל/ת".
- details: in Hebrew, factual summary of the situation
- Respond ONLY in JSON, no preamble.`

async function extractFromConversation(conversationId) {
  const { data: msgs } = await sb
    .from('chat_messages')
    .select('sender_type, content, is_private, created_at')
    .eq('conversation_id', conversationId)
    .eq('is_private', false)
    .order('created_at', { ascending: true })
  if (!msgs?.length) return { extracted: {}, msgCount: 0 }

  // Need at least one contact message to be able to extract anything useful
  const contactMsgs = msgs.filter(m => m.sender_type === 'contact')
  if (contactMsgs.length === 0) return { extracted: {}, msgCount: msgs.length }

  const messages = msgs.map(m => ({
    role: m.sender_type === 'contact' ? 'user' : 'assistant',
    content: m.content || '',
  }))

  try {
    const res = await createCompletion({
      provider: 'openai',
      model: 'gpt-4.1-mini',
      systemPrompt: EXTRACTION_PROMPT,
      messages,
      responseFormat: { type: 'json_object' },
    })
    return { extracted: JSON.parse(res.content || '{}') || {}, msgCount: msgs.length }
  } catch (err) {
    console.error('  extraction failed:', err.message)
    return { extracted: {}, msgCount: msgs.length }
  }
}

async function main() {
  await loadServiceCache(sb)

  const since = new Date(Date.now() - DAYS * 86400 * 1000).toISOString()
  const { data: leads } = await sb
    .from('leads')
    .select('id, user_id, name, phone, city, branch, branch_id, service_requested, source, company, type, metadata')
    .gte('created_at', since)
    .order('created_at', { ascending: true })

  if (!leads?.length) {
    console.log('No leads to inspect.')
    return
  }

  console.log(`Found ${leads.length} leads in last ${DAYS} days. COMMIT=${COMMIT}.\n`)

  let updated = 0
  let skipped = 0
  let transcribed = 0

  for (const lead of leads) {
    // Skip branch-view stubs (metadata.is_branch=true)
    if (lead.metadata?.is_branch) { skipped++; continue }

    // Identify gaps the backfill could fill
    const looksLikePhone = !lead.name || lead.name.trim() === '' ||
      /^\+?\d[\d\s\-]{5,}$/.test(lead.name) ||
      normalizePhone(lead.name) === lead.phone
    const gaps = {
      name: looksLikePhone,
      city: !lead.city || lead.city.trim() === '',
      service_requested: !lead.service_requested,
      branch: !lead.branch && !lead.branch_id,
    }
    const hasGap = Object.values(gaps).some(Boolean)
    if (!hasGap) { skipped++; continue }

    // Find the linked native conversation (most recent open/pending/resolved with messages)
    const { data: convs } = await sb
      .from('chat_conversations')
      .select('id, created_at')
      .eq('contact_id', lead.id)
      .order('created_at', { ascending: false })
      .limit(1)
    if (!convs?.length) {
      console.log(`#${lead.id} ${lead.name || lead.phone}: no conversation, skip`)
      skipped++
      continue
    }
    const convId = convs[0].id

    process.stdout.write(`#${lead.id} ${lead.name || lead.phone} (gaps: ${Object.entries(gaps).filter(([,v]) => v).map(([k]) => k).join(',')}) ... `)
    const { extracted, msgCount } = await extractFromConversation(convId)

    if (msgCount === 0) {
      console.log('empty conv, skip')
      skipped++
      continue
    }

    // Normalize extraction. Strip null-y stringy nulls the LLM occasionally returns.
    const clean = {}
    for (const [k, v] of Object.entries(extracted || {})) {
      if (v == null) continue
      const s = String(v).trim()
      if (!s || s.toLowerCase() === 'null') continue
      clean[k] = s
    }

    // Build saveLead args: only fill gaps; never overwrite existing values.
    const args = { source: 'backfill', lead_channel: 'whatsapp' }
    if (gaps.name && clean.name) args.name = clean.name
    else if (!gaps.name) args.name = lead.name // preserve existing
    if (gaps.city && clean.city) args.city = clean.city
    else if (!gaps.city) args.city = lead.city
    if (gaps.service_requested && clean.service_requested) args.service_requested = clean.service_requested
    else if (!gaps.service_requested) args.service_requested = lead.service_requested
    if (clean.details) args.details = clean.details
    args.phone = lead.phone

    // Need at least name+phone for saveLead to proceed (lenient mode).
    if (!args.name || /^\+?\d[\d\s\-]{5,}$/.test(args.name)) {
      console.log('no usable name in conversation, skip')
      // Still log the transcript so the lead card shows what was said.
      if (COMMIT) {
        await logBotTranscript(sb, lead.id, lead.user_id, { conversationId: convId })
        transcribed++
      }
      skipped++
      continue
    }

    if (!COMMIT) {
      console.log(`would update → ${JSON.stringify({
        ...(args.name !== lead.name ? { name: args.name } : {}),
        ...(args.city !== lead.city ? { city: args.city } : {}),
        ...(args.service_requested !== lead.service_requested ? { service_requested: args.service_requested } : {}),
      })}`)
      updated++
      continue
    }

    try {
      const result = await saveLead(args, {
        supabase: sb,
        userId: lead.user_id,
        conversationId: convId,
      })
      const parsed = JSON.parse(result)
      if (parsed.success) {
        console.log(`OK ${parsed.message}`)
        updated++
        transcribed++
      } else {
        console.log(`FAIL ${parsed.error}`)
        skipped++
      }
    } catch (err) {
      console.log(`ERR ${err.message}`)
      skipped++
    }
  }

  console.log(`\nDone. updated=${updated} skipped=${skipped} transcribed=${transcribed} commit=${COMMIT}`)
}

main().catch(err => { console.error(err); process.exit(1) })
