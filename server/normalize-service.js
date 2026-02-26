/**
 * Normalize service_requested values from various landing pages
 * into a unified set of service keys.
 *
 * Normalized values:
 *   עובד זר | מטפל/ת | יעוץ | שירות פרטי | השגחה בבית חולים | אחות פרטית | שירות אמבולנס | מחפש עבודה
 *
 * Routing:
 *   Aviezer  → עובד זר
 *   Babait   → מטפל/ת, יעוץ, שירות אמבולנס, מחפש עבודה
 *   Babait/אודי (fixed branch) → השגחה בבית חולים, אחות פרטית, שירות פרטי
 */

const SERVICE_MAP = {
  // עובד זר
  'אני מחפש/ת עובד זר': 'עובד זר',
  'עובד זר':             'עובד זר',

  // מטפל/ת
  'אני מחפש/ת מטפל':    'מטפל/ת',
  'מטפל ישראלי':         'מטפל/ת',

  // יעוץ
  'אני מחפש/ת יעוץ':    'יעוץ',
  'מחפש יעוץ':           'יעוץ',

  // שירות פרטי
  'אני מחפש/ת שירות פרטי': 'שירות פרטי',

  // השגחה בבית חולים
  'השגחה בבית חולים':    'השגחה בבית חולים',

  // אחות פרטית
  'אחות פרטית':          'אחות פרטית',

  // שירות אמבולנס
  'שירות אמבולנס':       'שירות אמבולנס',

  // מחפש עבודה
  'מחפש עבודה':          'מחפש עבודה',
}

/**
 * Service → Company routing (Udi is a branch of Babait, not a separate company)
 */
const SERVICE_COMPANY = {
  'עובד זר':             'aviezer',
  'מטפל/ת':              'babait',
  'יעוץ':                'babait',
  'שירות אמבולנס':       'babait',
  'מחפש עבודה':          'babait',
  'השגחה בבית חולים':    'babait',
  'אחות פרטית':          'babait',
  'שירות פרטי':          'babait',
}

/**
 * Services that route to a fixed branch (bypass city→branch index).
 * Udi services always go to the אודי branch.
 */
const SERVICE_FIXED_BRANCH = {
  'השגחה בבית חולים':    'אודי',
  'אחות פרטית':          'אודי',
  'שירות פרטי':          'אודי',
}

/**
 * Normalize a raw service_requested value.
 * Returns the normalized value, or the original trimmed value if no mapping found.
 */
export function normalizeService(raw) {
  if (!raw) return null
  const trimmed = raw.trim()
  return SERVICE_MAP[trimmed] || trimmed
}

/**
 * Resolve company from a normalized service_requested value.
 * Returns 'aviezer' or 'babait' (default).
 */
export function resolveCompany(normalizedService, defaultCompany = 'babait') {
  if (!normalizedService) return defaultCompany
  return SERVICE_COMPANY[normalizedService] || defaultCompany
}

/**
 * Resolve a fixed branch for services that bypass the city→branch index.
 * Returns branch name (e.g. 'אודי') or null if city→branch index should be used.
 */
export function resolveFixedBranch(normalizedService) {
  if (!normalizedService) return null
  return SERVICE_FIXED_BRANCH[normalizedService] || null
}

/**
 * Normalize an Israeli phone number to +972XXXXXXXXX format.
 * Strips dashes, spaces, and other non-numeric chars.
 * Returns the normalized number, or the original trimmed value if format is unrecognized.
 */
export function normalizePhone(phone) {
  if (!phone) return null
  const p = phone.replace(/[^0-9+]/g, '')
  if (p.startsWith('+972')) return p
  if (p.startsWith('972')) return '+' + p
  if (p.startsWith('0')) return '+972' + p.slice(1)
  if (/^[2-9]\d{8}$/.test(p)) return '+972' + p
  return phone.trim()
}
