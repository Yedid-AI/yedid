#!/usr/bin/env node
// Cherche dans la DB un appel qui matche les criteres du pipeline audio:
// - call_duration >= 60s
// - audio_processed_at IS NULL
// - source (user_name, cdr_ddi) configuree dans un followup_config actif
// - aucun lead recent (< 24h) pour ce telephone

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

function normPhone(s) {
  if (!s) return null
  let p = String(s).replace(/[^\d+]/g, '')
  if (!p.startsWith('+')) p = '+' + p.replace(/^\+/, '')
  return p
}

const { data: configs } = await supabase
  .from('followup_config')
  .select('user_id, org_id, sources, is_active')
  .eq('is_active', true)

console.log(`[debug] configs actives: ${configs?.length || 0}`)

const sourceFilters = []
const orgByConfig = []
for (const cfg of configs || []) {
  if (cfg.org_id) {
    const { data: lines } = await supabase
      .from('maskyoo_lines')
      .select('user_name, cdr_ddi')
      .eq('org_id', cfg.org_id)
    for (const l of lines || []) {
      sourceFilters.push({ user_name: l.user_name, cdr_ddi: l.cdr_ddi, user_id: cfg.user_id, org_id: cfg.org_id })
    }
  } else if (cfg.sources?.length) {
    for (const s of cfg.sources) {
      sourceFilters.push({ user_name: s.user_name, cdr_ddi: s.cdr_ddi, user_id: cfg.user_id, org_id: null })
    }
  }
}
console.log(`[debug] sources configurees: ${sourceFilters.length}`)

if (!sourceFilters.length) {
  console.log('Aucune source configuree — pipeline n\'aurait rien a faire.')
  process.exit(0)
}

// Cherche les appels candidats: derniere semaine, >= 60s
const since = new Date(Date.now() - 7 * 86400000).toISOString()
const { data: calls, error: callsErr } = await supabase
  .from('calls')
  .select('id, cdr_uniqueid, cdr_ani, cdr_ddi, user_name, start_call, call_duration, call_status')
  .gte('start_call', since)
  .gte('call_duration', 60)
  .order('start_call', { ascending: false })
  .limit(500)

if (callsErr) console.log('[err] calls query:', callsErr.message)
console.log(`[debug] appels >= 60s (7j): ${calls?.length || 0}`)
const distinctSources = new Set()
for (const c of calls || []) distinctSources.add(`${c.user_name}|${c.cdr_ddi}`)
console.log(`[debug] sources distinctes parmi les appels:`)
for (const s of [...distinctSources].slice(0, 15)) console.log('  ', s)
console.log(`[debug] sources configurees attendues:`)
for (const s of sourceFilters.slice(0, 15)) console.log('  ', `${s.user_name}|${s.cdr_ddi}`)

const matching = (calls || []).filter(c => sourceFilters.some(s =>
  s.user_name === c.user_name && s.cdr_ddi === c.cdr_ddi,
))
console.log(`[debug] matchant une source configuree: ${matching.length}`)

if (!matching.length) {
  console.log('Aucun candidat trouve.')
  process.exit(0)
}

// Pour chaque candidat, verifie qu'aucun lead recent n'existe
const phones = [...new Set(matching.map(c => normPhone(c.cdr_ani)).filter(Boolean))]
const recentCutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
const { data: recentLeads } = await supabase
  .from('leads')
  .select('phone, user_id, name, status, updated_at')
  .in('phone', phones)
  .gte('updated_at', recentCutoff)

const blockedPhones = new Set()
for (const filter of sourceFilters) {
  for (const lead of recentLeads || []) {
    if (lead.user_id === filter.user_id && phones.includes(lead.phone)) {
      blockedPhones.add(lead.phone)
    }
  }
}
console.log(`[debug] telephones bloques par lead recent: ${blockedPhones.size}`)

const finalCandidates = matching
  .filter(c => !blockedPhones.has(normPhone(c.cdr_ani)))
  .slice(0, 10)

console.log(`\n=== ${finalCandidates.length} candidat(s) eligibles pour le pipeline ===\n`)
for (const c of finalCandidates) {
  const filter = sourceFilters.find(s => s.user_name === c.user_name && s.cdr_ddi === c.cdr_ddi)
  console.log(`call_id=${c.id}`)
  console.log(`  start_call: ${c.start_call}`)
  console.log(`  duration: ${c.call_duration}s`)
  console.log(`  call_status: ${c.call_status}`)
  console.log(`  cdr_uniqueid: ${c.cdr_uniqueid}`)
  console.log(`  cdr_ani (caller): ${c.cdr_ani} → ${normPhone(c.cdr_ani)}`)
  console.log(`  cdr_ddi (line): ${c.cdr_ddi}`)
  console.log(`  user_name (branch): ${c.user_name}`)
  console.log(`  → tenant user_id: ${filter?.user_id} / org_id: ${filter?.org_id}`)
  console.log()
}
