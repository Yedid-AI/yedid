/**
 * Seed une donnee de test pour le chat natif:
 *   - Cree un chat_inbox 'website' (channel sans relais externe)
 *   - Cree (ou reutilise) un lead "Test Native"
 *   - Cree une chat_conversation
 *   - Insere 2 messages: 1 contact + 1 bot
 *
 * Usage:
 *   node scripts/seed-chat-test.js [user_id]
 *
 * Si user_id n'est pas passe, prend le 1er admin de la table users.
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
  let userId = process.argv[2] ? parseInt(process.argv[2]) : null

  if (!userId) {
    const { data } = await supabase
      .from('users')
      .select('id, email, role')
      .in('role', ['admin', 'super_admin'])
      .order('id', { ascending: true })
      .limit(1)
    if (!data?.length) throw new Error('No admin user found')
    userId = data[0].id
    console.log(`Using user_id=${userId} (${data[0].email})`)
  }

  // 1. agent_bot for this user (link to inbox)
  const { data: bots } = await supabase
    .from('agent_bots')
    .select('id, name')
    .eq('user_id', userId)
    .limit(1)
  const agentBotId = bots?.[0]?.id || null
  console.log(`agent_bot_id=${agentBotId} (${bots?.[0]?.name || 'none'})`)

  // 2. chat_inbox (idempotent: reuse if a 'TEST NATIVE' inbox exists)
  let { data: inbox } = await supabase
    .from('chat_inboxes')
    .select('id')
    .eq('user_id', userId)
    .eq('name', 'TEST NATIVE')
    .limit(1)
    .maybeSingle()

  if (!inbox) {
    const r = await supabase
      .from('chat_inboxes')
      .insert({
        user_id: userId,
        name: 'TEST NATIVE',
        channel_type: 'website',
        agent_bot_id: agentBotId,
        is_active: true,
        ai_enabled: true,
        greeting_message: 'Bonjour ! Comment puis-je vous aider ?',
      })
      .select('id')
      .single()
    if (r.error) throw r.error
    inbox = r.data
  }
  console.log(`chat_inbox.id=${inbox.id}`)

  // 3. lead (idempotent)
  let { data: lead } = await supabase
    .from('leads')
    .select('id, name')
    .eq('user_id', userId)
    .eq('phone', '+33600000000')
    .limit(1)
    .maybeSingle()

  if (!lead) {
    const r = await supabase
      .from('leads')
      .insert({
        user_id: userId,
        name: 'Test Native',
        phone: '+33600000000',
        email: 'test-native@example.com',
        source: 'native_chat_seed',
        lead_channel: 'website',
        status: 'new',
      })
      .select('id, name')
      .single()
    if (r.error) throw r.error
    lead = r.data
  }
  console.log(`lead.id=${lead.id} (${lead.name})`)

  // 4. chat_conversation (idempotent — reuse open if exists)
  let { data: conv } = await supabase
    .from('chat_conversations')
    .select('id')
    .eq('user_id', userId)
    .eq('inbox_id', inbox.id)
    .eq('contact_id', lead.id)
    .in('status', ['open', 'pending'])
    .limit(1)
    .maybeSingle()

  if (!conv) {
    const r = await supabase
      .from('chat_conversations')
      .insert({
        user_id: userId,
        inbox_id: inbox.id,
        contact_id: lead.id,
        channel: 'website',
        status: 'open',
      })
      .select('id')
      .single()
    if (r.error) throw r.error
    conv = r.data
  }
  console.log(`chat_conversation.id=${conv.id}`)

  // 5. messages (only if empty)
  const { count } = await supabase
    .from('chat_messages')
    .select('*', { count: 'exact', head: true })
    .eq('conversation_id', conv.id)

  if ((count || 0) === 0) {
    await supabase.from('chat_messages').insert([
      {
        conversation_id: conv.id,
        user_id: userId,
        sender_type: 'contact',
        contact_id: lead.id,
        content: 'Bonjour, je voudrais des informations.',
        content_type: 'text',
      },
      {
        conversation_id: conv.id,
        user_id: userId,
        sender_type: 'bot',
        content: 'Bien sur, je peux vous aider !',
        content_type: 'text',
      },
    ])
    console.log('Inserted 2 sample messages')
  } else {
    console.log(`Conversation already has ${count} messages, skipping`)
  }

  console.log('\n✓ Done. Open http://localhost:5173/chat in your browser.')
}

run().catch(err => {
  console.error('FATAL:', err.message)
  process.exit(1)
})
