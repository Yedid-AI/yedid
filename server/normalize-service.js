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
 *   Udi      → השגחה בבית חולים, אחות פרטית, שירות פרטי
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
 * Normalize a raw service_requested value.
 * Returns the normalized value, or the original trimmed value if no mapping found.
 */
export function normalizeService(raw) {
  if (!raw) return null
  const trimmed = raw.trim()
  return SERVICE_MAP[trimmed] || trimmed
}
