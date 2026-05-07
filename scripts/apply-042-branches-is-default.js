/**
 * Apply migration 042_branches_is_default.sql + seed aviezer's default branch.
 *
 * Adds branches.is_default and a unique partial index (one default per user).
 * Then flags elyahou (aviezer's only branch) as the tenant default so audio
 * pipeline / POST /api/leads can route aviezer leads even without a city
 * match.
 *
 * Usage: node scripts/apply-042-branches-is-default.js
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

const sqlPath = path.resolve(import.meta.dirname, '..', 'migrations', '042_branches_is_default.sql')
const sql = fs.readFileSync(sqlPath, 'utf-8')

const client = new pg.Client({ connectionString: DATABASE_URL })

async function run() {
  await client.connect()
  console.log('Connected. Applying 042_branches_is_default.sql ...')
  await client.query(sql)
  console.log('✓ Migration applied.')

  // Seed aviezer default — only branch they have today.
  const { rows: aviezerOwner } = await client.query(`
    SELECT id FROM users WHERE enterprise = 'aviezer' AND role = 'admin' ORDER BY id LIMIT 1
  `)
  if (!aviezerOwner.length) {
    console.warn('No aviezer admin user found — skipping default seed.')
    await client.end()
    return
  }
  const ownerId = aviezerOwner[0].id

  const { rowCount: updated } = await client.query(`
    UPDATE branches SET is_default = TRUE
    WHERE user_id = $1 AND is_active = TRUE
      AND id = (SELECT id FROM branches WHERE user_id = $1 AND is_active = TRUE ORDER BY id LIMIT 1)
  `, [ownerId])

  if (updated > 0) console.log(`✓ Flagged 1 aviezer branch as default (user_id=${ownerId})`)
  else console.log(`(no aviezer branch to flag — user_id=${ownerId} has none)`)

  await client.end()
}

run().catch(err => {
  console.error('FATAL:', err.message)
  process.exit(1)
})
