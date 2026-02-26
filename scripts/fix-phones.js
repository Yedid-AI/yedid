import pg from 'pg'

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) { console.error('FATAL: DATABASE_URL is required'); process.exit(1) }

const client = new pg.Client({ connectionString: DATABASE_URL })

async function main() {
  await client.connect()

  // ── Normalize leads phones in bulk using SQL ──
  // Handles: 0XX → +972XX, 972XX → +972XX, strips non-numeric chars
  const result = await client.query(`
    UPDATE leads
    SET phone = CASE
      WHEN regexp_replace(phone, '[^0-9+]', '', 'g') ~ '^\\+972' THEN regexp_replace(phone, '[^0-9+]', '', 'g')
      WHEN regexp_replace(phone, '[^0-9+]', '', 'g') ~ '^972' THEN '+' || regexp_replace(phone, '[^0-9+]', '', 'g')
      WHEN regexp_replace(phone, '[^0-9+]', '', 'g') ~ '^0' THEN '+972' || substring(regexp_replace(phone, '[^0-9+]', '', 'g') from 2)
      WHEN regexp_replace(phone, '[^0-9+]', '', 'g') ~ '^[2-9][0-9]{8}$' THEN '+972' || regexp_replace(phone, '[^0-9+]', '', 'g')
      ELSE phone
    END
    WHERE phone IS NOT NULL
      AND phone !~ '^\\+972'
  `)
  console.log(`Leads: ${result.rowCount} phones normalized`)

  // ── Show samples ──
  const { rows } = await client.query('SELECT id, name, phone FROM leads ORDER BY id DESC LIMIT 15')
  console.table(rows)

  // ── Show any non-normalized phones left ──
  const { rows: odd } = await client.query("SELECT id, phone FROM leads WHERE phone IS NOT NULL AND phone !~ '^\\+972' LIMIT 10")
  if (odd.length > 0) {
    console.log('Non-normalized phones remaining:')
    console.table(odd)
  } else {
    console.log('All phones normalized to +972 format')
  }

  await client.end()
}

main().catch(err => { console.error(err); process.exit(1) })
