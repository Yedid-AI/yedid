/**
 * Seed script: Import CSV lead data into the database.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... node scripts/seed-leads.js --babait-user=1 --aviezer-user=2
 *
 * Imports:
 *   1. Branches from "liste des snifim babait.csv"
 *   2. City-branch index from "index snifim.csv"
 *   3. Patient leads from "leads - babait - patient .csv"
 *   4. Caregiver leads from "lead - babait - cargivers.csv"
 *   5. Aviezer leads from "aviezer - lead.csv"
 */
import fs from 'fs'
import path from 'path'
import pg from 'pg'

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) { console.error('FATAL: DATABASE_URL is required'); process.exit(1) }

// Parse CLI args
const args = Object.fromEntries(
  process.argv.slice(2).map(a => { const [k, v] = a.replace('--', '').split('='); return [k, v] })
)
const babaitUserId = parseInt(args['babait-user'])
const aviezerUserId = parseInt(args['aviezer-user'])

if (!babaitUserId || !aviezerUserId) {
  console.error('Usage: node scripts/seed-leads.js --babait-user=<ID> --aviezer-user=<ID>')
  process.exit(1)
}

const client = new pg.Client({ connectionString: DATABASE_URL })
const dataDir = path.resolve(import.meta.dirname, '..', 'data', 'leads')

// ─── CSV Parser ──────────────────────────────────────────
function parseCSV(text) {
  const rows = []
  let row = [], field = '', inQ = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQ) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (ch === '"') inQ = false
      else field += ch
    } else {
      if (ch === '"') inQ = true
      else if (ch === ',') { row.push(field); field = '' }
      else if (ch === '\n' || (ch === '\r' && text[i + 1] === '\n')) {
        row.push(field); field = ''; rows.push(row); row = []
        if (ch === '\r') i++
      } else if (ch === '\r') {
        row.push(field); field = ''; rows.push(row); row = []
      } else field += ch
    }
  }
  if (field || row.length > 0) { row.push(field); rows.push(row) }
  return rows
}

function readCSV(filename) {
  const content = fs.readFileSync(path.join(dataDir, filename), 'utf-8')
  return parseCSV(content)
}

function clean(s) { return (s || '').trim().replace(/\u200f|\u200e/g, '') }

// Parse date string into ISO timestamp (or null)
function parseDate(dateStr, timeStr) {
  const d = clean(dateStr)
  const t = clean(timeStr)
  if (!d) return null

  // Format: YYYY-MM-DD HH:MM:SS (caregiver)
  if (/^\d{4}-\d{2}-\d{2}/.test(d)) {
    const dt = new Date(d)
    return isNaN(dt.getTime()) ? null : dt.toISOString()
  }

  // Format: DD/MM/YYYY (patient, aviezer)
  const m = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) {
    const year = parseInt(m[3])
    if (year < 2000) return null // skip bogus dates like 1907
    let iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
    if (t && /^\d{1,2}:\d{2}/.test(t)) {
      const timePart = t.includes(':') && t.split(':').length >= 3 ? t : t + ':00'
      iso += `T${timePart}`
    } else {
      iso += 'T00:00:00'
    }
    const dt = new Date(iso)
    return isNaN(dt.getTime()) ? null : dt.toISOString()
  }

  // Hebrew month names: "יוני 16, 2025"
  const heMonths = { 'ינואר': '01', 'פברואר': '02', 'מרץ': '03', 'אפריל': '04', 'מאי': '05', 'יוני': '06', 'יולי': '07', 'אוגוסט': '08', 'ספטמבר': '09', 'אוקטובר': '10', 'נובמבר': '11', 'דצמבר': '12' }
  const heMatch = d.match(/^(.+?)\s+(\d{1,2}),\s*(\d{4})$/)
  if (heMatch && heMonths[heMatch[1]]) {
    const iso = `${heMatch[3]}-${heMonths[heMatch[1]]}-${heMatch[2].padStart(2, '0')}T00:00:00`
    const dt = new Date(iso)
    return isNaN(dt.getTime()) ? null : dt.toISOString()
  }

  // Excel serial date number (days since 1899-12-30)
  if (/^\d{5}$/.test(d)) {
    const serial = parseInt(d)
    const dt = new Date(Date.UTC(1899, 11, 30 + serial))
    return isNaN(dt.getTime()) ? null : dt.toISOString()
  }

  return null
}

// ─── Import Functions ────────────────────────────────────

async function importBranches() {
  console.log('\n--- Importing branches ---')
  const rows = readCSV('liste des snifim babait.csv')
  // Headers: מייל סניף(0), נייד(1), איש קשר(2), מייל לשליחה(3), פקס(4), טלפון(5), כתובת(6), סניף(7), ..., chatwoot conversation ID(10)
  let count = 0
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const name = clean(r[7])
    if (!name) continue

    const branch = {
      user_id: babaitUserId,
      name,
      contact_name: clean(r[2]) || null,
      email: clean(r[0]) || null,
      phone: clean(r[5]) || null,
      mobile: clean(r[1]) || null,
      fax: clean(r[4]) || null,
      address: clean(r[6]) || null,
      chatwoot_conversation_id: r[10] ? parseInt(clean(r[10])) || null : null,
    }

    try {
      await client.query(
        `INSERT INTO branches (user_id, name, contact_name, email, phone, mobile, fax, address, chatwoot_conversation_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (user_id, name) DO NOTHING`,
        [branch.user_id, branch.name, branch.contact_name, branch.email, branch.phone, branch.mobile, branch.fax, branch.address, branch.chatwoot_conversation_id]
      )
      count++
    } catch (err) {
      console.error(`  Skip branch "${name}": ${err.message}`)
    }
  }
  console.log(`  Imported ${count} branches`)
}

async function importCityIndex() {
  console.log('\n--- Importing city-branch index ---')
  const rows = readCSV('index snifim.csv')
  // Headers: branch_name(0), city(1) — first row is ",ער"
  let count = 0
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const branchName = clean(r[0])
    const city = clean(r[1])
    if (!branchName || !city) continue

    try {
      await client.query(
        `INSERT INTO city_branch_index (user_id, city, branch_name) VALUES ($1, $2, $3)`,
        [babaitUserId, city, branchName]
      )
      count++
    } catch (err) {
      console.error(`  Skip city "${city}": ${err.message}`)
    }
  }
  console.log(`  Imported ${count} city entries`)
}

async function importPatientLeads() {
  console.log('\n--- Importing patient leads ---')
  const rows = readCSV('leads - babait - patient .csv')
  // Headers: מקור הפנייה(0), תאריך(1), שעה(2), שם(3), איזור מגורים(4), טלפון(5), שירות מבוקש(6), סוג השירות(7), פירוט(8), סניפים / מייל(9), לא נמצא כתובת(10), איזור / סניף(11), ip(12), ID(13)
  let count = 0, skipped = 0
  const values = []

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const name = clean(r[3])
    const phone = clean(r[5])
    if (!name || !phone) { skipped++; continue }

    const createdAt = parseDate(r[1], r[2])

    values.push([
      babaitUserId, 'babait', 'patient',
      name, phone,
      null, // email
      clean(r[4]) || null, // city
      clean(r[11]) || null, // branch
      null, // coordinator
      clean(r[0]) || null, // source
      null, // lead_channel
      clean(r[6]) || null, // service_requested
      clean(r[7]) || null, // service_type
      clean(r[8]) || null, // details
      'new',
      null, // position_type
      null, // experience
      clean(r[12]) || null, // ip
      null, // campaign
      '{}', // custom_fields
      createdAt, // created_at
    ])
  }

  // Batch insert
  for (let i = 0; i < values.length; i += 500) {
    const chunk = values.slice(i, i + 500)
    const placeholders = chunk.map((_, idx) => {
      const base = idx * 21
      const cols = Array.from({ length: 20 }, (_, j) => `$${base + j + 1}`).join(', ')
      return `(${cols}, COALESCE($${base + 21}, now()))`
    }).join(', ')
    const flat = chunk.flat()

    await client.query(
      `INSERT INTO leads (user_id, company, type, name, phone, email, city, branch, coordinator, source, lead_channel, service_requested, service_type, details, status, position_type, experience, ip_address, campaign, custom_fields, created_at)
       VALUES ${placeholders}`,
      flat
    )
    count += chunk.length
  }
  console.log(`  Imported ${count} patient leads (${skipped} skipped)`)
}

async function importCaregiverLeads() {
  console.log('\n--- Importing caregiver leads ---')
  const rows = readCSV('lead - babait - cargivers.csv')
  // Headers: ID(0), date(1), campaign(2), name(3), telephone(4), email(5), city(6), snif(7), misra(8), experience(9), status(10), details(11), n8n(12)
  let count = 0, skipped = 0
  const values = []

  const statusMap = {
    'נשלח לסניף': 'sent_to_branch',
    'אין מענה': 'no_answer',
    'TRUE': 'handled',
    'לא רלוונטי': 'not_relevant',
    'בטיפול': 'in_progress',
  }

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const name = clean(r[3])
    const phone = clean(r[4])
    if (!name || !phone) { skipped++; continue }

    const rawStatus = clean(r[10])
    const status = statusMap[rawStatus] || 'new'
    const exp = ['כן', 'yes', 'true', '1'].includes(clean(r[9]).toLowerCase())

    const createdAt = parseDate(r[1])

    values.push([
      babaitUserId, 'babait', 'caregiver',
      name, phone,
      clean(r[5]) || null, // email
      clean(r[6]) || null, // city
      clean(r[7]) || null, // branch
      null, // coordinator
      null, // source
      null, // lead_channel
      null, // service_requested
      null, // service_type
      clean(r[11]) || null, // details
      status,
      clean(r[8]) || null, // position_type (misra)
      exp, // experience
      null, // ip
      clean(r[2]) || null, // campaign
      '{}', // custom_fields
      createdAt, // created_at
    ])
  }

  for (let i = 0; i < values.length; i += 500) {
    const chunk = values.slice(i, i + 500)
    const placeholders = chunk.map((_, idx) => {
      const base = idx * 21
      const cols = Array.from({ length: 20 }, (_, j) => `$${base + j + 1}`).join(', ')
      return `(${cols}, COALESCE($${base + 21}, now()))`
    }).join(', ')
    const flat = chunk.flat()

    await client.query(
      `INSERT INTO leads (user_id, company, type, name, phone, email, city, branch, coordinator, source, lead_channel, service_requested, service_type, details, status, position_type, experience, ip_address, campaign, custom_fields, created_at)
       VALUES ${placeholders}`,
      flat
    )
    count += chunk.length
  }
  console.log(`  Imported ${count} caregiver leads (${skipped} skipped)`)
}

async function importAviezerLeads() {
  console.log('\n--- Importing Aviezer leads ---')
  const rows = readCSV('aviezer - lead.csv')
  // Headers: סוג הליד(0), מקור הפנייה(1), תאריך(2), שעה(3), איזור מגורים(4), שם הפונה(5), טלפון(6), שירות מבוקש(7), טופל(8), פירוט(9), Colonne 11(10)=branch, Colonne 12(11)=coordinator
  let count = 0, skipped = 0
  const values = []

  const statusMap = {
    'טופל': 'handled',
    'לא רלוונטי': 'not_relevant',
    'אין מענה': 'no_answer',
    'בטיפול': 'in_progress',
    'נשלח לסניף': 'sent_to_branch',
  }

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const name = clean(r[5])
    const phone = clean(r[6])
    if (!name || !phone) { skipped++; continue }

    const rawStatus = clean(r[8])
    const status = statusMap[rawStatus] || 'new'

    const createdAt = parseDate(r[2], r[3])

    values.push([
      aviezerUserId, 'aviezer', 'foreign_caregiver',
      name, phone,
      null, // email
      clean(r[4]) || null, // city
      clean(r[10]) || null, // branch
      clean(r[11]) || null, // coordinator
      clean(r[1]) || null, // source
      clean(r[0]) || null, // lead_channel (type of lead)
      clean(r[7]) || null, // service_requested
      null, // service_type
      clean(r[9]) || null, // details
      status,
      null, // position_type
      null, // experience
      null, // ip
      null, // campaign
      '{}', // custom_fields
      createdAt, // created_at
    ])
  }

  for (let i = 0; i < values.length; i += 500) {
    const chunk = values.slice(i, i + 500)
    const placeholders = chunk.map((_, idx) => {
      const base = idx * 21
      const cols = Array.from({ length: 20 }, (_, j) => `$${base + j + 1}`).join(', ')
      return `(${cols}, COALESCE($${base + 21}, now()))`
    }).join(', ')
    const flat = chunk.flat()

    await client.query(
      `INSERT INTO leads (user_id, company, type, name, phone, email, city, branch, coordinator, source, lead_channel, service_requested, service_type, details, status, position_type, experience, ip_address, campaign, custom_fields, created_at)
       VALUES ${placeholders}`,
      flat
    )
    count += chunk.length
  }
  console.log(`  Imported ${count} Aviezer leads (${skipped} skipped)`)
}

// ─── Main ────────────────────────────────────────────────
async function main() {
  await client.connect()
  console.log('Connected to database')
  console.log(`Babait user_id: ${babaitUserId}`)
  console.log(`Aviezer user_id: ${aviezerUserId}`)

  // Clean existing data before re-import
  console.log('\n--- Cleaning existing data ---')
  const { rowCount: leadsDeleted } = await client.query('DELETE FROM leads WHERE user_id IN ($1, $2)', [babaitUserId, aviezerUserId])
  const { rowCount: citiesDeleted } = await client.query('DELETE FROM city_branch_index WHERE user_id = $1', [babaitUserId])
  const { rowCount: branchesDeleted } = await client.query('DELETE FROM branches WHERE user_id = $1', [babaitUserId])
  console.log(`  Deleted ${leadsDeleted} leads, ${citiesDeleted} city entries, ${branchesDeleted} branches`)

  await importBranches()
  await importCityIndex()
  await importPatientLeads()
  await importCaregiverLeads()
  await importAviezerLeads()

  await client.end()
  console.log('\nDone!')
}

main().catch(err => {
  console.error('FATAL:', err.message)
  process.exit(1)
})
