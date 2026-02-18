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

  // 30 second timeout
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)

  let res
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timeout)
    if (err.name === 'AbortError') {
      throw new Error('Maskyoo: timeout apres 30s')
    }
    throw new Error(`Maskyoo: erreur reseau — ${err.message}`)
  }
  clearTimeout(timeout)

  const text = await res.text()
  console.log(`[maskyoo] Response: ${res.status} — ${text.length} chars`)

  // Maskyoo returns text errors for auth/IP issues
  if (!res.ok || text.startsWith('The ip address') || text.startsWith('Token')) {
    throw new Error(`Maskyoo (${res.status}): ${text}`)
  }

  try {
    const json = JSON.parse(text)

    // Maskyoo wraps responses: { service, status, result: [...] }
    if (json && typeof json === 'object' && !Array.isArray(json)) {
      if (json.status?.code && json.status.code !== 200) {
        throw new Error(`Maskyoo API error ${json.status.code}: ${json.status.description || ''}`)
      }
      if (Array.isArray(json.result)) {
        console.log(`[maskyoo] OK: ${json.result.length} rows`)
        return json.result
      }
      // For non-array results (single record, metadata, etc.)
      if (json.result !== undefined) {
        console.log(`[maskyoo] OK: single result`)
        return json.result
      }
    }

    // Fallback: return as-is
    console.log(`[maskyoo] OK: ${Array.isArray(json) ? json.length + ' rows' : typeof json}`)
    return json
  } catch (err) {
    if (err.message.startsWith('Maskyoo')) throw err
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

// Build recording URL + auth (returns binary MP3, not JSON — needs proxy)
export function getRecordingUrl(callUuid, type = 'mp3') {
  const { apiUrl, token } = getConfig()
  const qs = new URLSearchParams({ service: 'get_record_by_call_uuid', format: 'json', call_uuid: callUuid, type })
  return { url: `${apiUrl}/api/?${qs}`, token }
}

// Get call metadata by call UUID
export async function getCallMetadata(callUuid) {
  return maskyooApi('get_cdr_metadata_by_call_uuid', {
    call_uuid: callUuid,
  })
}
