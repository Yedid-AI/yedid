#!/usr/bin/env node
// Dry-run du pipeline audio.
// Mode 1 (defaut) — test de bout en bout sur un call reel (necessite IP whitelist Maskyoo)
// Mode 2 (--mock)  — test du LLM seulement avec un transcript mock (utile en dev local)

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { getRecordingUrl } from './server/maskyoo.js'
import { transcribeAudio } from './server/engine/voice.js'
import { createCompletion } from './server/engine/llm.js'
import { loadSettings } from './server/settings.js'

const args = process.argv.slice(2)
const mockMode = args.includes('--mock')
const callId = parseInt(args.find(a => /^\d+$/.test(a))) || 1165317

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)
await loadSettings(supabase)

const { data: call, error } = await supabase
  .from('calls')
  .select('id, cdr_uniqueid, cdr_ani, cdr_ddi, user_name, start_call, call_duration, call_status')
  .eq('id', callId)
  .single()

if (error || !call) {
  console.error('Call introuvable:', error?.message)
  process.exit(1)
}

console.log(`\n=== Test pipeline sur call ${call.id} ${mockMode ? '(MOCK)' : ''} ===`)
console.log(`Duree: ${call.call_duration}s | Status: ${call.call_status} | Branche: ${call.user_name}`)
console.log(`Caller: ${call.cdr_ani}\n`)

// 1. Whisper STT (ou mock)
let transcription
const t0 = Date.now()
if (mockMode) {
  // Transcript synthetique typique d'un appel a la branche aviezer
  // (services aux personnes agees en Israel)
  transcription = `שלום, מדבר רחל כהן מירושלים.
התקשרתי לכם כי אמא שלי בת שמונים וחמש,
היא חזרה מבית החולים אחרי ניתוח ירך
ואנחנו צריכים מטפלת פרטית שתשמור עליה בבית בשעות היום.
אנחנו גרים ברחביה.
מתי אפשר להתחיל? תודה רבה`
  console.log('[1/3] MOCK transcript (skipping Whisper):')
} else {
  console.log('[1/3] Fetch MP3 + Whisper STT…')
  const { url, token } = getRecordingUrl(call.cdr_uniqueid, 'mp3')
  const result = await transcribeAudio(url, { headers: { Authorization: `Bearer ${token}` } })
  transcription = result.transcription
}
const t1 = Date.now()
console.log(`  (${((t1 - t0) / 1000).toFixed(1)}s, ${transcription.length} chars):`)
console.log(`  ─────────────────────────`)
console.log(transcription.split('\n').map(l => '  ' + l).join('\n'))
console.log(`  ─────────────────────────\n`)

if (transcription.trim().length < 10) {
  console.log('Transcript trop court — pipeline aurait skip.')
  process.exit(0)
}

// 2. LLM analyse
console.log('[2/3] LLM analyse (gpt-4.1-mini)…')
const SYSTEM_PROMPT = `Tu es un assistant qui analyse des transcripts d'appels téléphoniques en hébreu reçus par une centrale d'aide aux personnes âgées et à leurs familles (services de soins à domicile, employés étrangers, garde à l'hôpital, etc.).

Tu reçois un transcript brut (Whisper, donc parfois bruité) et tu dois extraire les informations utiles pour créer un lead dans le CRM.

Réponds UNIQUEMENT avec un JSON valide, sans markdown ni commentaire, au format exact suivant:
{
  "is_relevant": boolean,
  "name": string|null,
  "city": string|null,
  "service_requested": string|null,
  "summary": string,
  "confidence": "low"|"medium"|"high"
}

Règles:
- "is_relevant" = true uniquement si c'est un vrai prospect intéressé par un service. false pour: démarchage, mauvais numéro, test, appel raccroché immédiatement, message vocal sans contenu utile, conversation hors sujet.
- "name" = nom du contact uniquement s'il est clairement énoncé. Null sinon (ne devine pas).
- "city" = ville uniquement si clairement énoncée. Null sinon.
- "service_requested" = en quelques mots en hébreu, le service demandé (ex: "עובד זר", "מטפלת פרטית", "השגחה בבית חולים", "ליווי לקשיש"). Null si pas clair.
- "summary" = 1-2 phrases en hébreu résumant ce que le prospect veut.
- "confidence" = "low" si transcript trop bruité ou court, "high" si infos claires.`

const userMessage = `Branche: ${call.user_name || 'inconnue'}
Numéro Maskyoo: ${call.cdr_ddi || 'inconnu'}
Téléphone du prospect: ${call.cdr_ani}
Durée: ${call.call_duration}s

Transcript:
${transcription}`

const t2 = Date.now()
const { content } = await createCompletion({
  provider: 'openai',
  model: 'gpt-4.1-mini',
  systemPrompt: SYSTEM_PROMPT,
  messages: [{ role: 'user', content: userMessage }],
  responseFormat: { type: 'json_object' },
})
const t3 = Date.now()
console.log(`  LLM (${((t3 - t2) / 1000).toFixed(1)}s, ${content.length} chars):`)
console.log(`  ─────────────────────────`)
console.log(content.split('\n').map(l => '  ' + l).join('\n'))
console.log(`  ─────────────────────────\n`)

// 3. Parse + verdict
console.log('[3/3] Parse JSON…')
const stripped = content.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
let analysis
try {
  analysis = JSON.parse(stripped)
} catch (err) {
  console.error('JSON invalide:', err.message)
  process.exit(1)
}

console.log('  Analyse parsee:')
console.log('   is_relevant       :', analysis.is_relevant)
console.log('   name              :', analysis.name)
console.log('   city              :', analysis.city)
console.log('   service_requested :', analysis.service_requested)
console.log('   confidence        :', analysis.confidence)
console.log('   summary           :', analysis.summary)

if (analysis.is_relevant) {
  console.log('\n→ Le pipeline aurait CREE OU ENRICHI un lead.')
  console.log('   user_id (tenant)   :', 1)  // resolved from followup_config
  console.log('   phone (normalized) :', call.cdr_ani)
  console.log('   source             : audio_pipeline')
  console.log('   details            : [appel transcrit]', analysis.summary)
} else {
  console.log('\n→ Le pipeline aurait MARQUE comme non-pertinent (pas de lead).')
}

console.log(`\nTotal: ${((t3 - t0) / 1000).toFixed(1)}s`)
