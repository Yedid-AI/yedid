/**
 * Read-only diagnostic for the Shira agent (agent_bot_id = 1).
 * Pulls 90 days of sessions, messages, and lead activity; produces:
 *   - /tmp/shira-analysis/stats.json   — global aggregates
 *   - /tmp/shira-analysis/by-playbook.csv
 *   - /tmp/shira-analysis/dropoffs.csv — long sessions without save_lead
 *   - /tmp/shira-analysis/samples/*.txt — anonymized transcripts by category
 *
 * Usage:
 *   node scripts/analyze-shira-conversations.js
 */
import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const AGENT_BOT_ID = 1
const DAYS = 90
const OUT = '/tmp/shira-analysis'
fs.mkdirSync(`${OUT}/samples`, { recursive: true })

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })

const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000).toISOString()
console.log(`[analyze] Window: since ${since}`)

// 1. Resolve scope: agent_bot.user_id is the canonical owner of Shira sessions.
// Sessions in this DB rarely have inbox_id set, so we filter by user_id instead.
const { data: ab, error: abErr } = await supabase
  .from('agent_bots').select('user_id').eq('id', AGENT_BOT_ID).single()
if (abErr) { console.error(abErr); process.exit(1) }
const shiraUserIds = [ab.user_id]
console.log(`[analyze] Shira user_id: ${ab.user_id}`)

// 2. Sessions in window, paged
async function fetchAll(table, builder, pageSize = 1000) {
  const out = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await builder.range(from, from + pageSize - 1)
    if (error) throw error
    out.push(...data)
    if (data.length < pageSize) break
  }
  return out
}

const sessions = await fetchAll('sessions',
  supabase.from('sessions')
    .select('id, user_id, inbox_id, status, billable, ai_reason, ai_confidence, contact_phone, contact_name, created_at, closed_at')
    .gte('created_at', since)
    .in('user_id', shiraUserIds))
console.log(`[analyze] Sessions: ${sessions.length}`)

const sessionIds = sessions.map(s => s.id)

// 3. Messages for those sessions, paged in chunks of 200 session ids
const messages = []
for (let i = 0; i < sessionIds.length; i += 200) {
  const chunk = sessionIds.slice(i, i + 200)
  const data = await fetchAll('conversation_messages',
    supabase.from('conversation_messages')
      .select('id, session_id, role, content, playbook_id, metadata, created_at')
      .in('session_id', chunk)
      .order('created_at', { ascending: true }))
  messages.push(...data)
}
console.log(`[analyze] Messages: ${messages.length}`)

// 4. Playbook titles
const { data: playbooks } = await supabase
  .from('playbooks').select('id, title, emoji').eq('agent_bot_id', AGENT_BOT_ID)
const pbById = Object.fromEntries(playbooks.map(p => [p.id, p]))

// 5. Lead activities by chatbot in window — NOTE: not filtered by user_id, because
// the bot's sessions live under user_id=1 (bot owner) but the leads it creates can
// land under different user_id (e.g. Babait = user_id=2). We match by metadata.session_id
// (preferred) or by phone fallback.
const leadActs = await fetchAll('lead_activities',
  supabase.from('lead_activities')
    .select('id, lead_id, user_id, action, actor, metadata, created_at')
    .gte('created_at', since)
    .eq('actor', 'chatbot'))
console.log(`[analyze] Lead activities (chatbot): ${leadActs.length}`)

const referencedLeadIds = [...new Set(leadActs.map(a => a.lead_id))]
const leadsAll = []
for (let i = 0; i < referencedLeadIds.length; i += 200) {
  const chunk = referencedLeadIds.slice(i, i + 200)
  const { data } = await supabase
    .from('leads')
    .select('id, user_id, phone, name, city, branch_id, service_requested, status, created_at')
    .in('id', chunk)
  if (data) leadsAll.push(...data)
}
const leadById = Object.fromEntries(leadsAll.map(l => [l.id, l]))

// Build session_id → lead_activity index from metadata.session_id
const actBySessionId = new Map()
for (const a of leadActs) {
  const sid = a.metadata?.session_id
  if (!sid) continue
  if (!actBySessionId.has(sid)) actBySessionId.set(sid, [])
  actBySessionId.get(sid).push(a)
}
console.log(`[analyze] Activities with session_id in metadata: ${[...actBySessionId.values()].flat().length}`)

// ─── Index messages per session ─────────────────────────────────
const msgsBySession = new Map()
for (const m of messages) {
  if (!msgsBySession.has(m.session_id)) msgsBySession.set(m.session_id, [])
  msgsBySession.get(m.session_id).push(m)
}

// ─── Per-session derived stats ─────────────────────────────────
const HEBREW_RE = /[\u0590-\u05FF]/
const EMOJI_RE = /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}]/u
const PROMISE_PHRASES = [
  'נציג יחזור', 'נציג ייצור', 'יצור איתך קשר', 'נחזור אליך',
  'אעביר', 'אשלח אליך', 'בקרוב'
]

const rows = []
for (const s of sessions) {
  const ms = msgsBySession.get(s.id) || []
  const userMsgs = ms.filter(m => m.role === 'user')
  const asstMsgs = ms.filter(m => m.role === 'assistant')
  const firstAt = ms[0]?.created_at
  const lastAt = ms[ms.length - 1]?.created_at
  const durSec = firstAt && lastAt
    ? (new Date(lastAt) - new Date(firstAt)) / 1000 : 0

  // Tool usage from assistant metadata
  const toolCalls = asstMsgs.flatMap(m => m.metadata?.tool_calls || [])
  const calledSaveLead = toolCalls.some(tc => tc.handler === 'save_lead' || tc.name?.includes('שמירת'))
  const kbSearches = asstMsgs.reduce((n, m) => n + (m.metadata?.kb_searches?.length || 0), 0)
  const totalRounds = asstMsgs.reduce((n, m) => n + (m.metadata?.tool_rounds || 0), 0)

  // Latency: time between user msg and next assistant
  const latencies = []
  for (let i = 0; i < ms.length - 1; i++) {
    if (ms[i].role === 'user' && ms[i + 1].role === 'assistant') {
      latencies.push((new Date(ms[i + 1].created_at) - new Date(ms[i].created_at)) / 1000)
    }
  }
  const avgLatency = latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : null

  // Multi-bubble usage
  const splitMsgs = asstMsgs.filter(m => m.content?.includes('---')).length

  // Style violations
  const violations = {
    long_msgs: asstMsgs.filter(m => (m.content || '').length > 300).length,
    bullet_points: asstMsgs.filter(m => /^[\s]*[-•]\s|^\s*\d+\.\s/m.test(m.content || '')).length,
    excessive_emojis: asstMsgs.filter(m => {
      const matches = (m.content || '').match(EMOJI_RE)
      return matches && matches.length > 2
    }).length,
    repeat_questions: 0,
    promise_no_save: 0,
  }

  // Repeated questions (assistant asked the same question twice)
  const questions = asstMsgs.map(m => (m.content || '').toLowerCase().split(/[?!.\n]/).filter(s => s.includes('?'))).flat()
  const qCounts = {}
  for (const q of questions) {
    const k = q.trim().slice(0, 40)
    if (k.length < 8) continue
    qCounts[k] = (qCounts[k] || 0) + 1
  }
  violations.repeat_questions = Object.values(qCounts).filter(c => c >= 2).length

  // Promise to send agent without saving
  const lastAssistant = asstMsgs[asstMsgs.length - 1]?.content || ''
  if (PROMISE_PHRASES.some(p => lastAssistant.includes(p)) && !calledSaveLead) {
    violations.promise_no_save = 1
  }

  // Active playbook = most-used playbook_id in messages
  const pbCounts = {}
  for (const m of ms) {
    if (m.playbook_id) pbCounts[m.playbook_id] = (pbCounts[m.playbook_id] || 0) + 1
  }
  const activePb = Object.entries(pbCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null

  // Match lead via metadata.session_id (preferred), then by phone fallback.
  // Note: lead_activity.actor='chatbot' is what matters, not user_id (multi-tenant data quirk).
  let leadSaved = null
  let leadActor = null
  let leadId = null
  // Only 'bot_transcript' activities carry session_id in metadata — but they always
  // accompany a created/enriched activity on the same lead_id within seconds. So look up
  // the matching created/enriched in the same lead.
  const transcripts = (actBySessionId.get(s.id) || [])
  if (transcripts.length) {
    const t = transcripts[0]
    leadId = t.lead_id
    const sibling = leadActs.find(a =>
      a.lead_id === t.lead_id
      && ['created', 'enriched'].includes(a.action)
      && Math.abs(new Date(a.created_at) - new Date(t.created_at)) <= 30000)
    if (sibling) {
      leadSaved = sibling.action
      leadActor = sibling.actor
    } else {
      // Fall back: transcript exists, treat as a save (action unknown)
      leadSaved = 'saved'
      leadActor = 'chatbot'
    }
  } else {
    const phoneNorm = (s.contact_phone || '').replace(/\D/g, '')
    if (phoneNorm) {
      const hit = leadActs.find(la => ['created', 'enriched'].includes(la.action)
        && new Date(la.created_at) >= new Date(s.created_at)
        && new Date(la.created_at) <= new Date(new Date(s.created_at).getTime() + 6 * 3600 * 1000)
        && (leadById[la.lead_id]?.phone || '').replace(/\D/g, '') === phoneNorm)
      if (hit) { leadSaved = hit.action; leadActor = hit.actor; leadId = hit.lead_id }
    }
  }
  const leadStatus = leadId ? leadById[leadId]?.status : null

  rows.push({
    id: s.id,
    user_id: s.user_id,
    created_at: s.created_at,
    duration_sec: Math.round(durSec),
    user_msgs: userMsgs.length,
    asst_msgs: asstMsgs.length,
    total_msgs: ms.length,
    has_phone: !!s.contact_phone,
    has_name: !!s.contact_name,
    billable: s.billable,
    status: s.status,
    ai_reason: s.ai_reason,
    active_playbook: activePb ? pbById[activePb]?.title : null,
    called_save_lead: calledSaveLead,
    kb_searches: kbSearches,
    tool_rounds: totalRounds,
    avg_latency_sec: avgLatency ? Math.round(avgLatency * 10) / 10 : null,
    split_msgs: splitMsgs,
    long_msgs: violations.long_msgs,
    bullets: violations.bullet_points,
    excessive_emojis: violations.excessive_emojis,
    repeat_questions: violations.repeat_questions,
    promise_no_save: violations.promise_no_save,
    lead_saved: leadSaved,
    lead_actor: leadActor,
    lead_id: leadId,
    lead_status: leadStatus,
  })
}

// ─── Aggregates (A — quantitatif) ───────────────────────────────
const total = rows.length
const engaged = rows.filter(r => r.user_msgs > 0)
const dropoffByMsgs = (n) => engaged.filter(r => r.user_msgs <= n).length
const conv = engaged.filter(r => r.lead_saved && r.lead_actor === 'chatbot')
const rescued = engaged.filter(r => r.lead_saved && r.lead_actor === 'closing_cron')
const noSave = engaged.filter(r => !r.lead_saved)

const stats = {
  window_days: DAYS,
  total_sessions: total,
  engaged_sessions: engaged.length,
  preview_sessions: rows.filter(r => r.ai_reason?.startsWith('PREVIEW')).length,
  open_sessions: rows.filter(r => r.status === 'open').length,
  drop_off: {
    one_user_msg: dropoffByMsgs(1),
    two_user_msgs: dropoffByMsgs(2),
    three_user_msgs: dropoffByMsgs(3),
  },
  msg_distribution: {
    avg_user: avg(engaged.map(r => r.user_msgs)),
    median_user: median(engaged.map(r => r.user_msgs)),
    p90_user: percentile(engaged.map(r => r.user_msgs), 90),
    avg_asst: avg(engaged.map(r => r.asst_msgs)),
  },
  conversion: {
    by_bot: conv.length,
    by_closing_cron: rescued.length,
    no_save: noSave.length,
    bot_conv_pct: pct(conv.length, engaged.length),
    total_conv_pct: pct(conv.length + rescued.length, engaged.length),
    rescue_share_pct: pct(rescued.length, conv.length + rescued.length),
  },
  ai_resolved_pct: pct(rows.filter(r => r.billable).length, total),
  tool_usage: {
    sessions_with_save_lead: rows.filter(r => r.called_save_lead).length,
    sessions_with_kb_search: rows.filter(r => r.kb_searches > 0).length,
    avg_kb_searches: avg(engaged.map(r => r.kb_searches)),
  },
  latency: {
    avg_sec: avg(rows.map(r => r.avg_latency_sec).filter(Boolean)),
    p90_sec: percentile(rows.map(r => r.avg_latency_sec).filter(Boolean), 90),
  },
  style_violations: {
    long_msgs_total: sum(rows.map(r => r.long_msgs)),
    bullets_total: sum(rows.map(r => r.bullets)),
    excessive_emojis_total: sum(rows.map(r => r.excessive_emojis)),
    repeat_questions_total: sum(rows.map(r => r.repeat_questions)),
    sessions_with_split_messages: rows.filter(r => r.split_msgs > 0).length,
    promise_without_save: rows.filter(r => r.promise_no_save).length,
  },
}

// Per-playbook breakdown
const byPb = {}
for (const r of engaged) {
  const k = r.active_playbook || '(none)'
  if (!byPb[k]) byPb[k] = { sessions: 0, conv: 0, rescued: 0, no_save: 0, avg_user_msgs: [], avg_dur: [] }
  byPb[k].sessions++
  if (r.lead_saved && r.lead_actor === 'chatbot') byPb[k].conv++
  else if (r.lead_saved && r.lead_actor === 'closing_cron') byPb[k].rescued++
  else byPb[k].no_save++
  byPb[k].avg_user_msgs.push(r.user_msgs)
  byPb[k].avg_dur.push(r.duration_sec)
}
const pbCsv = ['playbook,sessions,conv_bot,rescued,no_save,bot_conv_pct,avg_user_msgs,avg_dur_sec']
for (const [k, v] of Object.entries(byPb).sort((a, b) => b[1].sessions - a[1].sessions)) {
  pbCsv.push([
    `"${k.replace(/"/g, '""')}"`, v.sessions, v.conv, v.rescued, v.no_save,
    pct(v.conv, v.sessions), avg(v.avg_user_msgs), Math.round(avg(v.avg_dur)),
  ].join(','))
}

// Drop-off CSV — engaged sessions, no save, sorted by message count desc
const drop = engaged.filter(r => !r.lead_saved && !r.ai_reason?.startsWith('PREVIEW'))
  .sort((a, b) => b.user_msgs - a.user_msgs).slice(0, 200)
const dropCsv = ['session_id,playbook,user_msgs,asst_msgs,duration_sec,promise_no_save,repeat_q,status']
for (const r of drop) {
  dropCsv.push([
    r.id, `"${(r.active_playbook || '').replace(/"/g, '""')}"`,
    r.user_msgs, r.asst_msgs, r.duration_sec, r.promise_no_save, r.repeat_questions, r.status,
  ].join(','))
}

// ─── Sample transcripts (B — qualitatif) ──────────────────────
function anonymize(t) {
  return (t || '')
    .replace(/\+?\d{8,}/g, '[PHONE]')
    .replace(/[\w._%+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[EMAIL]')
}
function dumpTranscript(file, session, msgs, header) {
  const out = [`# ${header}`, `session_id=${session.id} created=${session.created_at} dur=${session.duration_sec}s`,
    `playbook=${session.active_playbook || '-'} lead_saved=${session.lead_saved || 'no'} actor=${session.lead_actor || '-'}`,
    `user_msgs=${session.user_msgs} asst_msgs=${session.asst_msgs} called_save_lead=${session.called_save_lead}`,
    '']
  for (const m of msgs) {
    out.push(`[${m.role === 'user' ? '👤' : '🤖'}] ${anonymize(m.content)}`)
  }
  fs.writeFileSync(file, out.join('\n'))
}

function pickSamples(name, predicate, n = 10) {
  const picks = engaged.filter(predicate).slice(0, n)
  picks.forEach((r, i) => {
    const ms = msgsBySession.get(r.id) || []
    dumpTranscript(`${OUT}/samples/${name}-${i + 1}.txt`, r, ms, name)
  })
  return picks.length
}
const sampleCounts = {
  conversions: pickSamples('conversion', r => r.lead_saved && r.lead_actor === 'chatbot'),
  rescued: pickSamples('rescued', r => r.lead_saved && r.lead_actor === 'closing_cron'),
  abandons: pickSamples('abandon', r => !r.lead_saved && r.user_msgs <= 2),
  long_no_save: pickSamples('long-no-save', r => !r.lead_saved && r.user_msgs >= 6),
  promise_no_save: pickSamples('promise-no-save', r => r.promise_no_save === 1),
  repeat_q: pickSamples('repeat-questions', r => r.repeat_questions >= 2),
}

// ─── Write outputs ─────────────────────────────────────────────
fs.writeFileSync(`${OUT}/stats.json`, JSON.stringify({ ...stats, samples: sampleCounts }, null, 2))
fs.writeFileSync(`${OUT}/by-playbook.csv`, pbCsv.join('\n'))
fs.writeFileSync(`${OUT}/dropoffs.csv`, dropCsv.join('\n'))
console.log(`\n[analyze] Wrote outputs to ${OUT}`)
console.log(JSON.stringify({ ...stats, samples: sampleCounts }, null, 2))

// ─── helpers ───────────────────────────────────────────────────
function avg(a) { if (!a.length) return 0; return Math.round(a.reduce((x, y) => x + y, 0) / a.length * 10) / 10 }
function sum(a) { return a.reduce((x, y) => x + y, 0) }
function median(a) { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] }
function percentile(a, p) { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length * p / 100)] }
function pct(a, b) { return b ? Math.round(1000 * a / b) / 10 : 0 }
