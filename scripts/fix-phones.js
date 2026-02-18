import pg from 'pg'

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) { console.error('FATAL: DATABASE_URL is required'); process.exit(1) }

function formatIsrael(phone) {
  if (!phone) return null
  let p = phone.replace(/[^0-9+]/g, '')
  if (p.startsWith('+972')) return p
  if (p.startsWith('972')) return '+' + p
  if (p.startsWith('0')) return '+972' + p.slice(1)
  if (/^[2-9]\d{8}$/.test(p)) return '+972' + p
  return phone
}

const client = new pg.Client({ connectionString: DATABASE_URL })

async function main() {
  await client.connect()
  const { rows } = await client.query('SELECT id, mobile, phone FROM branches')
  let updated = 0
  for (const row of rows) {
    const newMobile = formatIsrael(row.mobile)
    const newPhone = formatIsrael(row.phone)
    if (newMobile !== row.mobile || newPhone !== row.phone || !row.whatsapp_phone) {
      await client.query(
        'UPDATE branches SET mobile = $1, whatsapp_phone = $1, phone = $2 WHERE id = $3',
        [newMobile, newPhone, row.id]
      )
      updated++
    }
  }
  console.log(`Updated ${updated} branches`)

  const { rows: check } = await client.query('SELECT name, mobile, whatsapp_phone, phone FROM branches ORDER BY name LIMIT 10')
  console.table(check)
  await client.end()
}

main().catch(err => { console.error(err); process.exit(1) })
