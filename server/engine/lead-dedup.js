/**
 * Cross-tenant dedup helpers — used by followup-cron and audio-pipeline.
 *
 * Rule: when a lead already exists for a phone via an *external* channel
 * (website webhook, biper, capture link, etc.), our internal cron paths
 * (relance + audio pipeline) must back off. The webhook owns the lead.
 *
 * Without this gate we end up duplicating leads cross-tenant: e.g. biper
 * webhook lands a lead under aviezer (user_id=3) and the audio pipeline
 * creates a second one under babait (user_id=1) for the same phone.
 */

// Sources we consider "internal" — these are leads our own bots/crons created.
// Anything else is treated as external and blocks the relance / audio paths.
const INTERNAL_SOURCES = new Set([
  'audio_pipeline',
  'followup',
  'chatbot',
  'escalation',
  'whatsapp_native',
])

/**
 * Returns the set of normalized phones (subset of `phones`) for which an
 * external (non-internal) lead exists within the last `withinHours` hours.
 * Cross-tenant — does not filter by user_id.
 *
 * @param {Object} supabase
 * @param {string[]} phones - normalized phone numbers
 * @param {number} [withinHours]
 * @returns {Promise<Set<string>>}
 */
export async function getPhonesBlockedByExternalLead(supabase, phones, withinHours = 24) {
  const list = [...new Set((phones || []).filter(Boolean))]
  if (!list.length) return new Set()

  const cutoff = new Date(Date.now() - withinHours * 3600 * 1000).toISOString()
  const { data } = await supabase
    .from('leads')
    .select('phone, source')
    .in('phone', list)
    .gte('created_at', cutoff)

  const blocked = new Set()
  for (const lead of data || []) {
    if (lead.source && !INTERNAL_SOURCES.has(lead.source)) {
      blocked.add(lead.phone)
    }
  }
  return blocked
}

/**
 * Single-phone variant. Returns true if any external lead exists for this
 * phone within the window. Used in audio-pipeline per-call loop.
 */
export async function hasExternalLeadForPhone(supabase, phone, withinHours = 24) {
  const blocked = await getPhonesBlockedByExternalLead(supabase, [phone], withinHours)
  return blocked.has(phone)
}

export { INTERNAL_SOURCES }
