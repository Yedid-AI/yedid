// Maskyoo API helper — centralized interface for call tracking integration
import { getSetting } from './settings.js'

function getConfig() {
  let apiUrl = (getSetting('MASKYOO_API_URL') || '').trim().replace(/\/+$/, '')
  const token = (getSetting('MASKYOO_API_TOKEN') || '').trim()
  if (!apiUrl || !token) {
    throw new Error('Maskyoo non configure. Ajoutez MASKYOO_API_URL et MASKYOO_API_TOKEN dans Environnement.')
  }
  if (!/^https?:\/\//.test(apiUrl)) apiUrl = `https://${apiUrl}`
  return { apiUrl, token }
}

async function maskyooApi(service, params = {}) {
  const { apiUrl, token } = getConfig()
  const qs = new URLSearchParams({ service, format: 'json', ...params })
  const url = `${apiUrl}/api/?${qs}`
  console.log(`[maskyoo] GET ${url.replace(token, '***')}`)

  const res = await fetch(url, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` },
  })

  const text = await res.text()

  // Maskyoo returns text errors for auth/IP issues
  if (!res.ok || text.startsWith('The ip address') || text.startsWith('Token')) {
    throw new Error(`Maskyoo (${res.status}): ${text}`)
  }

  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`Maskyoo: reponse invalide — ${text.slice(0, 200)}`)
  }
}

// Query CDR (call detail records) with SQL
export async function queryCdr(sql) {
  return maskyooApi('cdr_query', { sql })
}

// Query calls by date range
export async function queryByDateRange(startTime, endTime) {
  return maskyooApi('cdr_subunique_query', {
    start_time: startTime,
    end_time: endTime,
  })
}

// Get call recording URL by call UUID
export async function getRecording(callUuid, type = 'mp3') {
  return maskyooApi('get_record_by_call_uuid', {
    call_uuid: callUuid,
    type,
  })
}

// Get call metadata by call UUID
export async function getCallMetadata(callUuid) {
  return maskyooApi('get_cdr_metadata_by_call_uuid', {
    call_uuid: callUuid,
  })
}
