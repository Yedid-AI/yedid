/**
 * One-shot manual backfill for the 15 incomplete leads from May 3-5 2026.
 *
 * Data extracted by hand from the WhatsApp conversations in chat_messages
 * (see analysis run on 2026-05-05). The accompanying LLM-based script
 * (`backfill-incomplete-leads.js`) handles future cases generically; this one
 * exists because OPENAI_API_KEY isn't available locally and the user wanted
 * the historical leads cleaned up immediately.
 *
 * What it does for each lead:
 *   - Fills the missing canonical fields (city, service_requested) when the
 *     conversation surfaced them
 *   - Triggers saveLead's branch resolution (Aviezer single-branch fallback,
 *     city→branch index for Babait) by going through saveLead — never raw UPDATE
 *   - Logs a bot_transcript activity so the lead card timeline shows the chat
 *
 * Usage:
 *   node scripts/backfill-3day-leads-manual.js              # dry run
 *   node scripts/backfill-3day-leads-manual.js --commit
 */
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { saveLead, logBotTranscript } from '../server/engine/internal-tools.js'
import { loadServiceCache } from '../server/normalize-service.js'

const COMMIT = process.argv.includes('--commit')
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

// Manually extracted from the conversation transcripts (see commit message
// for the full audit). For stub leads where the contact never replied we only
// log the transcript — no enrichment data to apply.
const PLAN = [
  // Branch-view stub — metadata.is_branch=true. Skip entirely.
  { id: 15612, action: 'skip', reason: 'branch view stub (is_branch=true)' },

  // Stubs where contact never replied past the bot intro — log transcript only.
  { id: 15609, action: 'transcript_only', reason: 'no contact reply' },
  { id: 15605, action: 'transcript_only', reason: 'no contact reply' },
  { id: 15603, action: 'transcript_only', reason: 'no contact reply' },
  { id: 15596, action: 'transcript_only', reason: 'no contact reply' },

  // "כבר הסתדרתי דיברתי עם ליקי מסניף חיפה" — close as handled.
  { id: 15589, action: 'close', status: 'handled', note: 'הפונה ציין שכבר הסתדר עם סניף חיפה' },

  // Internal coordinator forwarding internal note ("העברתי לסניף גבעתיים").
  // Not a customer lead — mark not_relevant.
  { id: 15590, action: 'close', status: 'not_relevant', note: 'הודעה פנימית של רכזת — אינה פונה' },

  // Duplicate phone (15593 already exists with the same +972544225887 + city + service).
  { id: 15592, action: 'close', status: 'not_relevant', note: 'כפילות של ליד #15593' },

  // Real enrichments — saveLead will only update fields that are currently empty,
  // so existing values (like Margalit's manually-set service "עובד זר") are preserved.
  {
    id: 15608, action: 'enrich',
    args: { name: 'אוראן טלמור', city: 'רמת גן גבעתיים', service_requested: 'מטפל/ת' },
  },
  {
    id: 15607, action: 'enrich',
    args: { name: 'Irit Akrabi', service_requested: 'מטפל/ת',
      details: 'בקשת סיוע בבית בעקבות ניתוח של בן הזוג ומצב רפואי של אירית.' },
  },
  {
    id: 15606, action: 'enrich',
    args: { name: 'מרטין שטרן', city: 'גבעת שמואל', service_requested: 'מטפל/ת',
      details: 'אמא בת 98 עולה מצרפת ביוני, צריכים מטפלת דוברת צרפתית. ביקש שהנציג שיחזור ידבר צרפתית.' },
  },
  {
    id: 15601, action: 'enrich',
    args: { name: 'מרגלית', city: 'קרית אונו', service_requested: 'עובד זר' },
  },
  {
    id: 15597, action: 'enrich',
    args: { name: 'Shahar Alster', city: 'תל השומר', service_requested: 'אחות פרטית',
      details: 'אם מאושפזת במחלקת השתלת מח עצם בבית חולים שיבא, האב נמצא איתה 24/7 וזקוק לעזרה.' },
  },
  {
    id: 15594, action: 'enrich',
    args: { name: 'רובי סמורלי', service_requested: 'עובד זר',
      details: 'אבא קשיש עיוור, צריך עובד זר 24/7 דחוף.' },
  },
  {
    id: 15593, action: 'enrich',
    // service_requested is currently "אחר" — saveLead's enrich path skips it
    // because the field is non-empty. Override by clearing it first.
    clearFirst: { service_requested: null },
    args: { name: 'סרניה', city: 'ירושלים.רחביה', service_requested: 'מטפל/ת',
      details: 'בקשת סיוע בנוגע למטופלת ברחביה בירושלים.' },
  },
]

async function findConv(leadId) {
  const { data } = await sb
    .from('chat_conversations')
    .select('id')
    .eq('contact_id', leadId)
    .order('created_at', { ascending: false })
    .limit(1)
  return data?.[0]?.id || null
}

async function main() {
  await loadServiceCache(sb)
  console.log(`Backfill plan: ${PLAN.length} leads. COMMIT=${COMMIT}\n`)

  for (const item of PLAN) {
    const { data: lead } = await sb
      .from('leads')
      .select('id, user_id, name, phone, city, branch, branch_id, service_requested, status, source, company')
      .eq('id', item.id)
      .maybeSingle()
    if (!lead) { console.log(`#${item.id}: not found`); continue }

    const convId = await findConv(item.id)
    const label = `#${item.id} ${lead.name || lead.phone}`

    if (item.action === 'skip') {
      console.log(`${label}: SKIP (${item.reason})`)
      continue
    }

    if (item.action === 'transcript_only') {
      if (!convId) { console.log(`${label}: TRANSCRIPT skip (no conv)`); continue }
      if (!COMMIT) { console.log(`${label}: would log transcript (${item.reason})`); continue }
      await logBotTranscript(sb, lead.id, lead.user_id, { conversationId: convId })
      console.log(`${label}: transcript logged (${item.reason})`)
      continue
    }

    if (item.action === 'close') {
      if (!COMMIT) { console.log(`${label}: would close as ${item.status} — ${item.note}`); continue }
      await sb.from('leads').update({ status: item.status, updated_at: new Date().toISOString() }).eq('id', lead.id)
      await sb.from('lead_activities').insert({
        lead_id: lead.id, user_id: lead.user_id, action: 'status_changed',
        actor: 'backfill', changes: { status: { from: lead.status, to: item.status } },
        metadata: { comment: item.note },
      })
      if (convId) await logBotTranscript(sb, lead.id, lead.user_id, { conversationId: convId })
      console.log(`${label}: closed as ${item.status}`)
      continue
    }

    if (item.action === 'enrich') {
      if (item.clearFirst && COMMIT) {
        await sb.from('leads').update(item.clearFirst).eq('id', lead.id)
      }
      const args = { ...item.args, phone: lead.phone, source: 'backfill', lead_channel: 'whatsapp' }
      if (!COMMIT) {
        console.log(`${label}: would saveLead → ${JSON.stringify(args)}`)
        continue
      }
      try {
        const result = await saveLead(args, { supabase: sb, userId: lead.user_id, conversationId: convId })
        const parsed = JSON.parse(result)
        if (parsed.success) {
          console.log(`${label}: ${parsed.message}`)
        } else {
          console.log(`${label}: FAIL ${parsed.error}`)
        }
      } catch (err) {
        console.log(`${label}: ERR ${err.message}`)
      }
    }
  }

  console.log('\nDone.')
}

main().catch(err => { console.error(err); process.exit(1) })
