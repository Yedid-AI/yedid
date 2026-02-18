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

    // If response is already an array, return it
    if (Array.isArray(json)) {
      console.log(`[maskyoo] Parsed: ${json.length} rows (array)`)
      return json
    }

    // Maskyoo wraps results in an object — find the array inside
    if (json && typeof json === 'object') {
      const keys = Object.keys(json)
      console.log(`[maskyoo] Parsed: object with keys [${keys.join(', ')}]`)

      // Try common wrapper keys
      for (const key of ['data', 'results', 'rows', 'records', 'cdr', 'calls']) {
        if (Array.isArray(json[key])) {
          console.log(`[maskyoo] Extracted ${json[key].length} rows from .${key}`)
          return json[key]
        }
      }

      // Fallback: find the first array value
      for (const key of keys) {
        if (Array.isArray(json[key])) {
          console.log(`[maskyoo] Extracted ${json[key].length} rows from .${key}`)
          return json[key]
        }
      }

      // If it's an object with numeric-ish keys, it might be an indexed collection
      if (keys.length > 0 && keys.every(k => /^\d+$/.test(k))) {
        const arr = keys.map(k => json[k])
        console.log(`[maskyoo] Converted indexed object to ${arr.length} rows`)
        return arr
      }

      // Log sample for debugging
      console.log(`[maskyoo] Sample: ${JSON.stringify(json).slice(0, 300)}`)
    }

    return json
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
