/**
 * Run all SQL migrations in order against the PostgreSQL database.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... node scripts/run-migrations.js
 */
import fs from 'fs'
import path from 'path'
import pg from 'pg'

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('FATAL: DATABASE_URL is required')
  process.exit(1)
}

const client = new pg.Client({ connectionString: DATABASE_URL })

async function run() {
  await client.connect()
  console.log('Connected to database\n')

  const migrationsDir = path.resolve(import.meta.dirname, '..', 'migrations')
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort()

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8').trim()
    if (!sql) continue
    console.log(`Running ${file}...`)
    try {
      await client.query(sql)
      console.log(`  ✓ ${file}`)
    } catch (err) {
      console.error(`  ✗ ${file}: ${err.message}`)
    }
  }

  await client.end()
  console.log('\nDone.')
}

run().catch(err => {
  console.error('FATAL:', err.message)
  process.exit(1)
})
