/**
 * One-shot align of `chat_inboxes.{agent_bot_id,ai_enabled,ai_schedule,ai_timezone}`
 * with the legacy `inboxes` table — matched by `unipile_account_id`.
 *
 * Background: the chat_inboxes table is what the native engine reads. The UI
 * (Inboxes.jsx) reads/writes `inboxes` (legacy Chatwoot). They diverged at
 * migration: the seed attached default agents to chat_inboxes that the UI
 * never saw or controlled. From this commit, the routes mirror UI edits — but
 * pre-existing rows still need this script run once.
 *
 * Usage:
 *   node scripts/sync-legacy-to-chat-inboxes.js              # dry run
 *   node scripts/sync-legacy-to-chat-inboxes.js --commit
 */
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const COMMIT = process.argv.includes('--commit')
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const { data: legacyRows } = await sb
  .from('inboxes')
  .select('id, name, user_id, unipile_account_id, agent_bot_id, ai_enabled, ai_schedule, ai_timezone')
  .not('unipile_account_id', 'is', null)
const { data: chatRows } = await sb
  .from('chat_inboxes')
  .select('id, name, user_id, unipile_account_id, agent_bot_id, ai_enabled, ai_schedule, ai_timezone')
  .not('unipile_account_id', 'is', null)

console.log(`Legacy inboxes with unipile_account_id: ${legacyRows?.length || 0}`)
console.log(`chat_inboxes with unipile_account_id: ${chatRows?.length || 0}\n`)

const chatByAccount = new Map((chatRows || []).map(c => [c.unipile_account_id, c]))

// Multiple legacy rows can share a unipile_account_id (e.g. inbox #19 + #21
// both for "Dispatch 972552732923"). Pick the one with a non-null
// agent_bot_id if any, else the most recent — matches the UI's "active" row.
const legacyByAccount = new Map()
for (const l of legacyRows || []) {
  const existing = legacyByAccount.get(l.unipile_account_id)
  if (!existing) { legacyByAccount.set(l.unipile_account_id, l); continue }
  if (l.agent_bot_id && !existing.agent_bot_id) {
    legacyByAccount.set(l.unipile_account_id, l)
  }
}

const planned = []
for (const [accountId, legacy] of legacyByAccount.entries()) {
  const chat = chatByAccount.get(accountId)
  if (!chat) {
    console.log(`SKIP account=${accountId} (legacy "${legacy.name}") — no chat_inboxes row`)
    continue
  }
  const diffs = {}
  if (legacy.agent_bot_id !== chat.agent_bot_id) diffs.agent_bot_id = { from: chat.agent_bot_id, to: legacy.agent_bot_id }
  if (legacy.ai_enabled !== chat.ai_enabled) diffs.ai_enabled = { from: chat.ai_enabled, to: legacy.ai_enabled }
  if (JSON.stringify(legacy.ai_schedule) !== JSON.stringify(chat.ai_schedule)) diffs.ai_schedule = { from: chat.ai_schedule, to: legacy.ai_schedule }
  if (legacy.ai_timezone !== chat.ai_timezone) diffs.ai_timezone = { from: chat.ai_timezone, to: legacy.ai_timezone }
  if (Object.keys(diffs).length) {
    planned.push({ accountId, chatId: chat.id, legacyId: legacy.id, name: legacy.name, diffs })
  }
}

if (!planned.length) {
  console.log('Already in sync. Nothing to do.')
  process.exit(0)
}

console.log(`${planned.length} chat_inboxes rows out of sync:\n`)
for (const p of planned) {
  console.log(`#${p.chatId} ${p.name} (account ${p.accountId})`)
  for (const [field, { from, to }] of Object.entries(p.diffs)) {
    console.log(`  ${field}: ${JSON.stringify(from)} → ${JSON.stringify(to)}`)
  }
}

if (!COMMIT) {
  console.log(`\nDRY RUN. Re-run with --commit to apply.`)
  process.exit(0)
}

console.log(`\nApplying...`)
for (const p of planned) {
  const updates = { updated_at: new Date().toISOString() }
  for (const [field, { to }] of Object.entries(p.diffs)) updates[field] = to
  const { error } = await sb.from('chat_inboxes').update(updates).eq('id', p.chatId)
  console.log(`  ${p.name}: ${error ? 'ERR ' + error.message : 'OK'}`)
}
console.log('\nDone.')
