/**
 * Apply migration 040_drop_chatwoot.sql — DESTRUCTIVE.
 *
 * Lis le commentaire en tete de migrations/040_drop_chatwoot.sql
 * AVANT de lancer ce script. Prerequis:
 *   - NATIVE_CHAT_ENABLED=true valide depuis 7+ jours
 *   - Backup base recent
 *
 * Usage: node scripts/apply-040-drop-chatwoot.js --confirm
 */
import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import pg from 'pg'

if (!process.argv.includes('--confirm')) {
  console.error('REFUSED: pass --confirm to acknowledge that this drops Chatwoot tables and columns.')
  console.error('Read migrations/040_drop_chatwoot.sql first.')
  process.exit(1)
}

const DATABASE_URL = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('FATAL: SUPABASE_DB_URL (or DATABASE_URL) is required')
  process.exit(1)
}

const sqlPath = path.resolve(import.meta.dirname, '..', 'migrations', '040_drop_chatwoot.sql')
const sql = fs.readFileSync(sqlPath, 'utf-8')

const client = new pg.Client({ connectionString: DATABASE_URL })

async function run() {
  await client.connect()
  console.log('Connected. Applying 040_drop_chatwoot.sql ...')
  await client.query(sql)
  console.log('✓ Migration applied. Chatwoot tables/columns are GONE.')

  const { rows } = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('inboxes', 'chatwoot_accounts')
  `)
  if (rows.length > 0) {
    console.warn('WARNING: still present:', rows.map(r => r.table_name).join(', '))
  } else {
    console.log('✓ Verified: inboxes + chatwoot_accounts dropped')
  }

  await client.end()
}

run().catch(err => {
  console.error('FATAL:', err.message)
  process.exit(1)
})
