/**
 * Apply migration 041_calls_audio_processing.sql — additive (safe).
 *
 * Adds audio_processed_at, transcript, transcript_analysis columns to calls
 * and a partial index for the audio-pipeline candidate query.
 *
 * Usage: node scripts/apply-041-calls-audio-processing.js
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

const sqlPath = path.resolve(import.meta.dirname, '..', 'migrations', '041_calls_audio_processing.sql')
const sql = fs.readFileSync(sqlPath, 'utf-8')

const client = new pg.Client({ connectionString: DATABASE_URL })

async function run() {
  await client.connect()
  console.log('Connected. Applying 041_calls_audio_processing.sql ...')
  await client.query(sql)
  console.log('✓ Migration applied.')

  const { rows } = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'calls'
      AND column_name IN ('audio_processed_at', 'transcript', 'transcript_analysis')
    ORDER BY column_name
  `)
  console.log(`✓ Columns present: ${rows.map(r => r.column_name).join(', ')}`)

  await client.end()
}

run().catch(err => {
  console.error('FATAL:', err.message)
  process.exit(1)
})
