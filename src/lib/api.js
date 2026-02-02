const API_BASE = '/api'

let refreshPromise = null

async function tryRefreshToken() {
  const refreshToken = localStorage.getItem('refresh_token')
  if (!refreshToken) return false

  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
    if (!res.ok) return false
    const data = await res.json()
    localStorage.setItem('token', data.token)
    localStorage.setItem('refresh_token', data.refresh_token)
    return true
  } catch {
    return false
  }
}

async function request(path, options = {}) {
  const token = localStorage.getItem('token')
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  })

  // On 401, try refreshing the token before giving up
  if (res.status === 401 && path !== '/login' && path !== '/register' && path !== '/auth/refresh') {
    // Deduplicate concurrent refresh attempts
    if (!refreshPromise) {
      refreshPromise = tryRefreshToken().finally(() => { refreshPromise = null })
    }
    const refreshed = await refreshPromise

    if (refreshed) {
      // Retry the original request with the new token
      const newToken = localStorage.getItem('token')
      const retryHeaders = {
        ...headers,
        Authorization: `Bearer ${newToken}`,
      }
      const retryRes = await fetch(`${API_BASE}${path}`, { ...options, headers: retryHeaders })
      let retryData
      try { retryData = await retryRes.json() } catch { throw new Error('Erreur serveur') }
      if (!retryRes.ok) {
        const err = new Error(retryData.error || 'Erreur serveur')
        err.status = retryRes.status
        throw err
      }
      return retryData
    }

    // Refresh failed — clear and redirect
    localStorage.removeItem('token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('user')
    window.location.href = '/login'
    throw new Error('Session expiree')
  }

  let data
  try {
    data = await res.json()
  } catch {
    throw new Error('Erreur serveur')
  }
  if (!res.ok) {
    const err = new Error(data.error || 'Erreur serveur')
    err.status = res.status
    throw err
  }
  return data
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),
  put: (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (path) => request(path, { method: 'DELETE' }),
  upload: async (path, formData) => {
    const token = localStorage.getItem('token')
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Erreur serveur')
    return data
  },
}
