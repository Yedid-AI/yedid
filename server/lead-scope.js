/**
 * Lead access scope resolution per user role.
 *
 *   super_admin                    → all leads
 *   admin (enterprise=null)        → all leads (yedid global)
 *   admin (enterprise=babait|...)  → leads where company = enterprise
 *   branch                         → leads where branch_id ∈ user_branches
 *   marketeur                      → leads where id ∈ lead_affiliations
 *   anything else                  → none
 */

export async function getLeadScope(req) {
  const { role, user_id, enterprise } = req.user
  if (role === 'super_admin') return { scope: 'all' }
  if (role === 'admin' && !enterprise) return { scope: 'all' }
  if (role === 'admin' && enterprise) return { scope: 'company', value: enterprise }
  if (role === 'branch') {
    const { data } = await req.supabaseAdmin
      .from('user_branches').select('branch_id').eq('user_id', user_id)
    return { scope: 'branches', value: (data || []).map(r => r.branch_id) }
  }
  if (role === 'marketeur') {
    const { data } = await req.supabaseAdmin
      .from('lead_affiliations').select('lead_id').eq('user_id', user_id)
    return { scope: 'affiliations', value: (data || []).map(r => r.lead_id) }
  }
  return { scope: 'none' }
}

export function applyLeadScope(query, scope) {
  if (scope.scope === 'all') return query
  if (scope.scope === 'company') return query.eq('company', scope.value)
  if (scope.scope === 'branches') {
    return scope.value.length ? query.in('branch_id', scope.value) : query.eq('id', -1)
  }
  if (scope.scope === 'affiliations') {
    return scope.value.length ? query.in('id', scope.value) : query.eq('id', -1)
  }
  return query.eq('id', -1)
}

export async function canAccessLead(req, leadId) {
  const scope = await getLeadScope(req)
  if (scope.scope === 'all') return true
  if (scope.scope === 'none') return false

  const { data: lead } = await req.supabaseAdmin
    .from('leads').select('id, company, branch_id').eq('id', leadId).maybeSingle()
  if (!lead) return false

  if (scope.scope === 'company') return lead.company === scope.value
  if (scope.scope === 'branches') return lead.branch_id != null && scope.value.includes(lead.branch_id)
  if (scope.scope === 'affiliations') return scope.value.includes(lead.id)
  return false
}

/**
 * Resolve the BIGINT user_id that owns a given enterprise (= company root admin).
 * Used by public endpoints to attribute new leads to the right company.
 * Returns null if no admin with that enterprise exists.
 */
export async function resolveCompanyOwnerId(supabaseAdmin, enterprise) {
  if (!enterprise) return null
  const { data } = await supabaseAdmin
    .from('users').select('id')
    .eq('enterprise', enterprise)
    .eq('role', 'admin')
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle()
  return data?.id || null
}

/**
 * Lookup branch_id for a (companyOwnerId, branchName) tuple.
 * Returns null if no match.
 */
export async function resolveBranchId(supabaseAdmin, companyOwnerId, branchName) {
  if (!companyOwnerId || !branchName) return null
  const { data } = await supabaseAdmin
    .from('branches').select('id')
    .eq('user_id', companyOwnerId)
    .eq('name', branchName)
    .maybeSingle()
  return data?.id || null
}
