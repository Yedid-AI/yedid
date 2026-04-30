/**
 * Service routing helpers.
 *
 * The routing rules (which raw values normalize to which canonical service,
 * which company / fixed branch each service routes to) live in the
 * `service_config` table and are editable from the admin UI. This module
 * exposes synchronous helpers backed by an in-memory cache that is loaded at
 * server startup and refreshed whenever the config is mutated through the
 * `/api/service-config` route.
 *
 * Why sync helpers + cache instead of awaited DB calls:
 *   The helpers are called from many hot paths (lead capture webhooks,
 *   internal tools, list normalization in /api/leads). Adding an `await` to
 *   every call site would ripple through too much code for a config table
 *   that is read 100x more often than it is written.
 */

let SERVICE_CACHE = {
  byName: new Map(),    // canonical name → row
  aliasMap: new Map(),  // raw alias → canonical name (also includes name → name)
  list: [],             // ordered active rows, for UI / dropdowns
  loadedAt: 0,
}

/**
 * Load service config from DB into the in-memory cache. Called at server
 * startup and after any mutation through /api/service-config.
 *
 * Safe to call without a supabase client (no-op) — the helpers fall back to
 * passthrough behavior so dev environments without a DB don't crash.
 */
export async function loadServiceCache(supabaseAdmin) {
  if (!supabaseAdmin) return
  const { data, error } = await supabaseAdmin
    .from('service_config')
    .select('*')
    .order('display_order', { ascending: true })

  if (error) {
    console.error('[service-config] cache load failed:', error.message)
    return
  }

  const byName = new Map()
  const aliasMap = new Map()
  const list = []

  for (const row of data || []) {
    byName.set(row.name, row)
    aliasMap.set(row.name, row.name)
    for (const a of row.aliases || []) aliasMap.set(String(a).trim(), row.name)
    if (row.is_active) list.push(row)
  }

  SERVICE_CACHE = { byName, aliasMap, list, loadedAt: Date.now() }
}

/**
 * Normalize a raw service_requested value to its canonical name.
 * Returns the canonical name, or the original trimmed value if no mapping found.
 */
export function normalizeService(raw) {
  if (!raw) return null
  const trimmed = String(raw).trim()
  return SERVICE_CACHE.aliasMap.get(trimmed) || trimmed
}

/**
 * Resolve company from a normalized service_requested value.
 * Returns 'aviezer' or 'babait' (default).
 */
export function resolveCompany(normalizedService, defaultCompany = 'babait') {
  if (!normalizedService) return defaultCompany
  const row = SERVICE_CACHE.byName.get(normalizedService)
  return row?.company || defaultCompany
}

/**
 * Resolve a fixed branch for services that bypass the city→branch index.
 * Returns branch name (e.g. 'אודי') or null if city→branch index should be used.
 */
export function resolveFixedBranch(normalizedService) {
  if (!normalizedService) return null
  return SERVICE_CACHE.byName.get(normalizedService)?.fixed_branch || null
}

/**
 * Read the cached active service list (for dropdowns / public form).
 */
export function listServices() {
  return SERVICE_CACHE.list
}

/**
 * Normalize an Israeli phone number to +972XXXXXXXXX format.
 * Strips dashes, spaces, and other non-numeric chars.
 * Returns the normalized number, or null if the input doesn't contain a real phone.
 *
 * Returning null for garbage (e.g. "המספר שלך", "phone", random text) is critical:
 * the LLM occasionally hallucinates placeholders into the phone arg of save_lead, and
 * all callers do `if (!phone) reject` — letting garbage pass would create leads with
 * bogus phones that can never be re-matched or de-duped.
 */
export function normalizePhone(phone) {
  if (!phone) return null
  const p = String(phone).replace(/[^0-9+]/g, '')
  const digits = p.replace(/\D/g, '')
  if (digits.length < 7) return null
  if (p.startsWith('+972')) return p
  if (p.startsWith('972')) return '+' + p
  if (p.startsWith('0')) return '+972' + p.slice(1)
  if (/^[2-9]\d{8}$/.test(p)) return '+972' + p
  if (digits.length >= 10) return p.startsWith('+') ? p : '+' + p
  return null
}
