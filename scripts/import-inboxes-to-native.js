/**
 * Importe les inboxes Chatwoot existants dans la table chat_inboxes (natif).
 *
 * Mapping:
 *   inboxes.channel_type='whatsapp' (avec unipile_account_id) → chat_inboxes.channel_type='whatsapp_unipile'
 *   inboxes.channel_type='web'                                → chat_inboxes.channel_type='website'
 *   inboxes.channel_type='api' (sans unipile)                 → IGNORE (canal de bridge Chatwoot, pas reel)
 *
 * Idempotent:
 *   - Pour whatsapp_unipile: dedup sur unipile_account_id (UNIQUE INDEX)
 *   - Pour website: dedup sur (user_id, name)
 *
 * Conserve: name, agent_bot_id, ai_enabled, ai_schedule, ai_timezone, phone_number, widget_locale.
 *
 * Usage: node scripts/import-inboxes-to-native.js
 */
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !serviceKey) {
  console.error('FATAL: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required')
  process.exit(1)
}
const supabase = createClient(supabaseUrl, serviceKey)

async function run() {
  const { data: inboxes, error } = await supabase
    .from('inboxes')
    .select('id, user_id, name, channel_type, unipile_account_id, phone_number, agent_bot_id, widget_locale, ai_enabled, ai_schedule, ai_timezone')
    .order('id')
  if (error) throw error

  let created = 0
  let updated = 0
  let skipped = 0

  for (const ib of inboxes) {
    // Determine target channel_type for the native inbox
    let nativeChannelType = null
    if (ib.unipile_account_id && (ib.channel_type === 'whatsapp' || ib.channel_type === 'whatsapp_unipile')) {
      nativeChannelType = 'whatsapp_unipile'
    } else if (ib.channel_type === 'web' || ib.channel_type === 'website') {
      nativeChannelType = 'website'
    } else if (ib.channel_type === 'api' && !ib.unipile_account_id) {
      // API channels are Chatwoot bridge inboxes (auto-created when wiring WhatsApp)
      console.log(`  [skip] inbox ${ib.id} "${ib.name}" — Chatwoot API bridge`)
      skipped++
      continue
    } else {
      console.log(`  [skip] inbox ${ib.id} "${ib.name}" — channel=${ib.channel_type}, no mapping`)
      skipped++
      continue
    }

    // Find existing native inbox
    let existing = null
    if (nativeChannelType === 'whatsapp_unipile') {
      const r = await supabase
        .from('chat_inboxes')
        .select('id')
        .eq('unipile_account_id', ib.unipile_account_id)
        .limit(1)
        .maybeSingle()
      existing = r.data
    } else {
      const r = await supabase
        .from('chat_inboxes')
        .select('id')
        .eq('user_id', ib.user_id)
        .eq('name', ib.name)
        .eq('channel_type', nativeChannelType)
        .limit(1)
        .maybeSingle()
      existing = r.data
    }

    const payload = {
      user_id: ib.user_id,
      name: ib.name,
      channel_type: nativeChannelType,
      agent_bot_id: ib.agent_bot_id,
      is_active: true,
      ai_enabled: ib.ai_enabled !== false,
      ai_schedule: ib.ai_schedule || null,
      ai_timezone: ib.ai_timezone || null,
      unipile_account_id: ib.unipile_account_id || null,
      phone_number: ib.phone_number || null,
      widget_locale: ib.widget_locale || null,
    }

    if (existing) {
      const { error: upErr } = await supabase
        .from('chat_inboxes')
        .update(payload)
        .eq('id', existing.id)
      if (upErr) {
        console.error(`  [error] update inbox ${ib.id}:`, upErr.message)
        continue
      }
      console.log(`  [update] chat_inbox ${existing.id} <- inboxes.${ib.id} "${ib.name}" (${nativeChannelType})`)
      updated++
    } else {
      const { data: ins, error: insErr } = await supabase
        .from('chat_inboxes')
        .insert(payload)
        .select('id')
        .single()
      if (insErr) {
        console.error(`  [error] insert inbox ${ib.id}:`, insErr.message)
        continue
      }
      console.log(`  [create] chat_inbox ${ins.id} <- inboxes.${ib.id} "${ib.name}" (${nativeChannelType})`)
      created++
    }
  }

  // Cleanup: drop the seed TEST NATIVE inboxes if user asks (commented out for safety)
  // const { count } = await supabase.from('chat_inboxes').delete().eq('name', 'TEST NATIVE').select('id', { count: 'exact' })

  console.log(`\nDone. Created=${created}, Updated=${updated}, Skipped=${skipped}`)
}

run().catch(err => {
  console.error('FATAL:', err.message)
  process.exit(1)
})
