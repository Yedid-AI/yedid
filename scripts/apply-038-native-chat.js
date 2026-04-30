/**
 * Apply migration 038_native_chat.sql to Supabase Postgres.
 *
 * Migration is 100% additive (CREATE IF NOT EXISTS / DO $$ EXCEPTION)
 * so it's safe to re-run.
 *
 * Usage: node scripts/apply-038-native-chat.js
 */
import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import pg from 'pg'

const DATABASE_URL = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('FATAL: SUPABASE_DB_URL (or DATABASE_URL) is required')
  process.exit(1)
}

const sqlPath = path.resolve(import.meta.dirname, '..', 'migrations', '038_native_chat.sql')
const sql = fs.readFileSync(sqlPath, 'utf-8')

const client = new pg.Client({ connectionString: DATABASE_URL })

async function run() {
  await client.connect()
  console.log('Connected to Supabase Postgres')
  console.log('Applying migration 038_native_chat.sql ...\n')

  await client.query(sql)
  console.log('✓ Migration applied successfully')

  // Verify tables created
  const { rows } = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('chat_inboxes', 'chat_conversations', 'chat_messages')
    ORDER BY table_name
  `)
  console.log('\nTables present:', rows.map(r => r.table_name).join(', '))

  await client.end()
}

run().catch(err => {
  console.error('FATAL:', err.message)
  process.exit(1)
})
