/**
 * Apply migration 041_branches_as_chat_contacts.sql.
 *
 * Schema is additive (ADD COLUMN IF NOT EXISTS, DROP CONSTRAINT IF EXISTS).
 * The backfill is targeted (4 specific lead IDs known to be pure stubs); Aaron
 * #15562 stays as a hybrid customer + branch.
 *
 * Usage:
 *   node scripts/apply-041-branches-as-chat-contacts.js
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

const sqlPath = path.resolve(import.meta.dirname, '..', 'migrations', '041_branches_as_chat_contacts.sql')
const sql = fs.readFileSync(sqlPath, 'utf-8')

const client = new pg.Client({ connectionString: DATABASE_URL })

async function run() {
  await client.connect()
  console.log('Connected to Supabase Postgres\n')

  // Wrap in a transaction so a partial failure leaves nothing half-applied.
  await client.query('BEGIN')
  try {
    await client.query(sql)
    await client.query('COMMIT')
    console.log('✓ Migration 041 applied\n')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  }

  // Verify
  const cols = await client.query(`
    SELECT table_name, column_name, is_nullable, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND ((table_name = 'chat_conversations' AND column_name IN ('contact_id', 'branch_id'))
        OR (table_name = 'chat_messages'      AND column_name IN ('contact_id', 'branch_id')))
    ORDER BY table_name, column_name
  `)
  console.log('Schema check:')
  for (const r of cols.rows) console.log(`  ${r.table_name}.${r.column_name} nullable=${r.is_nullable} type=${r.data_type}`)

  const remaining = await client.query(`SELECT COUNT(*) FROM leads WHERE metadata->>'is_branch' = 'true'`)
  console.log(`\nBranch leads remaining: ${remaining.rows[0].count}`)

  const branchConvs = await client.query(`SELECT COUNT(*) FROM chat_conversations WHERE branch_id IS NOT NULL`)
  console.log(`Conversations with branch_id set: ${branchConvs.rows[0].count}`)

  await client.end()
}

run().catch(err => {
  console.error('FATAL:', err.message)
  process.exit(1)
})
