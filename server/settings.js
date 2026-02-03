// Settings service — reads from DB with fallback to process.env
// Infra vars (SUPABASE_*, JWT_SECRET, PORT, ADMIN_*) stay in .env only
// Service vars (API keys, URLs) are configurable from the dashboard

const CONFIGURABLE_KEYS = [
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'FIRECRAWL_URL',
  'CHATWOOT_PLATFORM_URL',
  'CHATWOOT_PLATFORM_TOKEN',
  'CHATWOOT_ADMIN_TOKEN',
  'APP_BASE_URL',
  'AGENT_API_KEY',
  // Unipile (WhatsApp)
  'UNIPILE_API_KEY',
  'UNIPILE_DSN_URL',
  // Closing & Billing
  'CLOSING_ENABLED',
  'CLOSING_INTERVAL_MINUTES',
  'CLOSING_INACTIVITY_MINUTES',
  'CLOSING_LLM_PROVIDER',
  'CLOSING_LLM_MODEL',
  'CLOSING_BILLING_PROMPT',
]

// In-memory cache
let cache = {}
let cacheLoaded = false

export { CONFIGURABLE_KEYS }

export async function loadSettings(supabase) {
  if (!supabase) return

  const { data, error } = await supabase
    .from('settings')
    .select('key, value')

  if (error) {
    console.log('Settings load error:', error.message)
    return
  }

  cache = {}
  for (const row of data || []) {
    cache[row.key] = row.value
  }
  cacheLoaded = true
}

export function getSetting(key) {
  // DB value takes priority, fallback to process.env
  if (cache[key] !== undefined && cache[key] !== null && cache[key] !== '') {
    return cache[key]
  }
  return process.env[key] || ''
}

export async function upsertSettings(settings, supabase) {
  for (const [key, value] of Object.entries(settings)) {
    if (!CONFIGURABLE_KEYS.includes(key)) continue

    const { error } = await supabase
      .from('settings')
      .upsert(
        { key, value: value || '', updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      )

    if (error) throw error
    cache[key] = value
  }
}
