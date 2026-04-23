import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect, useCallback } from 'react'
import { api } from '../lib/api'
import { queryKeys } from '../lib/query-keys'

// ─── Agents ──────────────────────────────────────────────
export function useAgents() {
  return useQuery({
    queryKey: queryKeys.agents,
    queryFn: () => api.get('/agent-bots'),
    select: (data) => data.agent_bots,
  })
}

export function useAgent(id) {
  return useQuery({
    queryKey: queryKeys.agent(id),
    queryFn: () => api.get(`/agent-bots/${id}`),
    select: (data) => data.agent_bot,
    enabled: !!id,
  })
}

export function useCreateAgent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body) => api.post('/agent-bots', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.agents }),
  })
}

export function useDeleteAgent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/agent-bots/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.agents }),
  })
}

export function useUpdateAgentConfig(agentBotId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body) => api.put(`/agent-bots/${agentBotId}/config`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.agent(agentBotId) }),
  })
}

// ─── Playbooks ───────────────────────────────────────────
export function usePlaybooks(agentBotId) {
  return useQuery({
    queryKey: queryKeys.playbooks(agentBotId),
    queryFn: () => api.get(`/agent-bots/${agentBotId}/playbooks`),
    select: (data) => data.playbooks,
    enabled: !!agentBotId,
  })
}

export function useCreatePlaybook(agentBotId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body) => api.post(`/agent-bots/${agentBotId}/playbooks`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.playbooks(agentBotId) }),
  })
}

export function useUpdatePlaybook(agentBotId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }) => api.put(`/agent-bots/${agentBotId}/playbooks/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.playbooks(agentBotId) }),
  })
}

export function useDeletePlaybook(agentBotId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/agent-bots/${agentBotId}/playbooks/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.playbooks(agentBotId) }),
  })
}

// ─── Tools ───────────────────────────────────────────────
export function useTools(agentBotId) {
  return useQuery({
    queryKey: queryKeys.tools(agentBotId),
    queryFn: () => api.get(`/agent-bots/${agentBotId}/tools`),
    select: (data) => data.tools,
    enabled: !!agentBotId,
  })
}

export function useCreateTool(agentBotId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body) => api.post(`/agent-bots/${agentBotId}/tools`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.tools(agentBotId) })
      qc.invalidateQueries({ queryKey: queryKeys.playbooks(agentBotId) })
    },
  })
}

export function useUpdateTool(agentBotId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }) => api.put(`/agent-bots/${agentBotId}/tools/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.tools(agentBotId) })
      qc.invalidateQueries({ queryKey: queryKeys.playbooks(agentBotId) })
    },
  })
}

export function useDeleteTool(agentBotId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/agent-bots/${agentBotId}/tools/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.tools(agentBotId) })
      qc.invalidateQueries({ queryKey: queryKeys.playbooks(agentBotId) })
    },
  })
}

// ─── Escalation Rules ────────────────────────────────────
export function useEscalationRules(agentBotId) {
  return useQuery({
    queryKey: queryKeys.escalationRules(agentBotId),
    queryFn: () => api.get(`/agent-bots/${agentBotId}/escalation-rules`),
    select: (data) => data.rules,
    enabled: !!agentBotId,
  })
}

export function useCreateEscalation(agentBotId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body) => api.post(`/agent-bots/${agentBotId}/escalation-rules`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.escalationRules(agentBotId) }),
  })
}

export function useUpdateEscalation(agentBotId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }) => api.put(`/agent-bots/${agentBotId}/escalation-rules/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.escalationRules(agentBotId) }),
  })
}

export function useDeleteEscalation(agentBotId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/agent-bots/${agentBotId}/escalation-rules/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.escalationRules(agentBotId) }),
  })
}

// ─── Playbooks Library (user-scoped) ─────────────────────
export function usePlaybooksLibrary() {
  return useQuery({
    queryKey: queryKeys.playbooksLibrary,
    queryFn: () => api.get('/playbooks'),
    select: (data) => data.playbooks,
  })
}

export function useCreatePlaybookLibrary() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body) => api.post('/playbooks', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.playbooksLibrary }),
  })
}

export function useUpdatePlaybookLibrary() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }) => api.put(`/playbooks/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.playbooksLibrary }),
  })
}

export function useDeletePlaybookLibrary() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/playbooks/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.playbooksLibrary }),
  })
}

// ─── Tools Library (user-scoped) ─────────────────────────
export function useToolsLibrary() {
  return useQuery({
    queryKey: queryKeys.toolsLibrary,
    queryFn: () => api.get('/tools'),
    select: (data) => data.tools,
  })
}

export function useCreateToolLibrary() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body) => api.post('/tools', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.toolsLibrary })
      qc.invalidateQueries({ queryKey: queryKeys.playbooksLibrary })
    },
  })
}

export function useUpdateToolLibrary() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }) => api.put(`/tools/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.toolsLibrary })
      qc.invalidateQueries({ queryKey: queryKeys.playbooksLibrary })
    },
  })
}

export function useDeleteToolLibrary() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/tools/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.toolsLibrary })
      qc.invalidateQueries({ queryKey: queryKeys.playbooksLibrary })
    },
  })
}

// ─── Escalation Rules Library (user-scoped) ──────────────
export function useEscalationRulesLibrary() {
  return useQuery({
    queryKey: queryKeys.escalationRulesLibrary,
    queryFn: () => api.get('/escalation-rules'),
    select: (data) => data.rules,
  })
}

export function useCreateEscalationLibrary() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body) => api.post('/escalation-rules', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.escalationRulesLibrary }),
  })
}

export function useUpdateEscalationLibrary() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }) => api.put(`/escalation-rules/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.escalationRulesLibrary }),
  })
}

export function useDeleteEscalationLibrary() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/escalation-rules/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.escalationRulesLibrary }),
  })
}

// ─── Agent ↔ Library Associations ────────────────────────
export function useAgentPlaybooks(agentBotId) {
  return useQuery({
    queryKey: queryKeys.agentPlaybooks(agentBotId),
    queryFn: () => api.get(`/agent-bots/${agentBotId}/playbooks`),
    select: (data) => data.playbooks,
    enabled: !!agentBotId,
  })
}

export function useUpdateAgentPlaybooks(agentBotId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (playbook_ids) => api.put(`/agent-bots/${agentBotId}/playbooks`, { playbook_ids }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.agentPlaybooks(agentBotId) }),
  })
}

export function useAgentEscalationRules(agentBotId) {
  return useQuery({
    queryKey: queryKeys.agentEscalationRules(agentBotId),
    queryFn: () => api.get(`/agent-bots/${agentBotId}/escalation-rules`),
    select: (data) => data.rules,
    enabled: !!agentBotId,
  })
}

export function useUpdateAgentEscalationRules(agentBotId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (escalation_rule_ids) => api.put(`/agent-bots/${agentBotId}/escalation-rules`, { escalation_rule_ids }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.agentEscalationRules(agentBotId) }),
  })
}

// ─── Inboxes ─────────────────────────────────────────────
export function useInboxes() {
  return useQuery({
    queryKey: queryKeys.inboxes,
    queryFn: () => api.get('/inboxes'),
    select: (data) => data.inboxes,
  })
}

export function useInbox(id) {
  return useQuery({
    queryKey: queryKeys.inbox(id),
    queryFn: () => api.get(`/inboxes/${id}`),
    select: (data) => data.inbox,
    enabled: !!id,
  })
}

export function useCreateInbox() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body) => api.post('/inboxes', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.inboxes }),
  })
}

export function useDeleteInbox() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/inboxes/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.inboxes }),
  })
}

export function useConnectWhatsApp() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post('/whatsapp/connect'),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.inboxes }),
  })
}

export function useWhatsAppStatus(id) {
  return useQuery({
    queryKey: queryKeys.whatsappStatus(id),
    queryFn: () => api.get(`/inboxes/${id}/whatsapp-status`),
    enabled: !!id,
    refetchInterval: 60_000,
  })
}

export function useWhatsAppReconnect() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.post(`/inboxes/${id}/whatsapp-reconnect`),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: queryKeys.whatsappStatus(id) })
    },
  })
}

export function useInboxChatwoot(id) {
  return useQuery({
    queryKey: queryKeys.inboxChatwoot(id),
    queryFn: () => api.get(`/inboxes/${id}/chatwoot`),
    enabled: !!id,
  })
}

export function useUpdateInbox() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }) => api.put(`/inboxes/${id}`, body),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: queryKeys.inboxes })
      qc.invalidateQueries({ queryKey: queryKeys.inbox(id) })
      qc.invalidateQueries({ queryKey: queryKeys.inboxChatwoot(id) })
    },
  })
}

export function useUploadInboxAvatar() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, file }) => {
      const formData = new FormData()
      formData.append('avatar', file)
      return api.upload(`/inboxes/${id}/avatar`, formData)
    },
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: queryKeys.inboxChatwoot(id) })
    },
  })
}

export function useChatwootAgents() {
  return useQuery({
    queryKey: queryKeys.chatwootAgents,
    queryFn: () => api.get('/chatwoot-agents'),
    select: (data) => data.agents,
  })
}

export function useInboxMembers(id) {
  return useQuery({
    queryKey: queryKeys.inboxMembers(id),
    queryFn: () => api.get(`/inboxes/${id}/members`),
    select: (data) => data.members,
    enabled: !!id,
  })
}

export function useUpdateInboxMembers() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, user_ids }) => api.put(`/inboxes/${id}/members`, { user_ids }),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: queryKeys.inboxMembers(id) })
    },
  })
}

export function useUpdateInboxAiSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }) => api.put(`/inboxes/${id}/ai-settings`, body),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: queryKeys.inboxes })
      qc.invalidateQueries({ queryKey: queryKeys.inbox(id) })
    },
  })
}

export function useAssignAgent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ inboxId, agentBotId }) =>
      api.put(`/inboxes/${inboxId}/assign-agent`, {
        agent_bot_id: agentBotId === 'none' ? null : parseInt(agentBotId),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.inboxes }),
  })
}

// ─── Sessions ────────────────────────────────────────────
export function useSessions(filters) {
  return useQuery({
    queryKey: queryKeys.sessions(filters),
    queryFn: () => {
      const params = new URLSearchParams()
      if (filters?.status && filters.status !== 'all') params.set('status', filters.status)
      if (filters?.inbox_id && filters.inbox_id !== 'all') params.set('inbox_id', filters.inbox_id)
      if (filters?.date_from) params.set('date_from', filters.date_from)
      if (filters?.date_to) params.set('date_to', filters.date_to)
      const qs = params.toString()
      return api.get(`/sessions${qs ? '?' + qs : ''}`)
    },
  })
}

export function useSession(id) {
  return useQuery({
    queryKey: queryKeys.session(id),
    queryFn: () => api.get(`/sessions/${id}`),
    select: (data) => data.session,
    enabled: !!id,
  })
}

export function useSessionMessages(id) {
  return useQuery({
    queryKey: queryKeys.sessionMessages(id),
    queryFn: () => api.get(`/sessions/${id}/messages`),
    select: (data) => data.messages || [],
    enabled: !!id,
  })
}

// ─── Sources ─────────────────────────────────────────────
export function useSources() {
  return useQuery({
    queryKey: queryKeys.sources,
    queryFn: () => api.get('/sources'),
    select: (data) => data.sources,
    refetchInterval: (query) => {
      const sources = query.state.data
      if (Array.isArray(sources) && sources.some((s) => s.status === 'pending' || s.status === 'processing')) {
        return 5_000
      }
      return 30_000
    },
  })
}

export function useCreateSource() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body) => api.post('/sources', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.sources }),
  })
}

export function useDeleteSource() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/sources/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.sources }),
  })
}

// ─── Users ───────────────────────────────────────────────
export function useUsers({ enabled = true } = {}) {
  return useQuery({
    queryKey: queryKeys.users,
    queryFn: () => api.get('/users'),
    select: (data) => data.users,
    staleTime: 5 * 60_000,
    enabled,
  })
}

export function useUser(id) {
  return useQuery({
    queryKey: queryKeys.user(id),
    queryFn: () => api.get(`/users/${id}`),
    enabled: !!id,
  })
}

export function useCreateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body) => api.post('/register', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.users }),
  })
}

export function useUpdateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }) => api.put(`/users/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.users }),
  })
}

export function useDeleteUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/users/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.users }),
  })
}

export function useProvisionChat() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (userId) => api.post('/provision-chat', { user_id: userId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.users }),
  })
}

// ─── User ↔ Branches (M:N) ───────────────────────────────
export function useAllUserBranches() {
  return useQuery({
    queryKey: ['user-branches', 'all'],
    queryFn: () => api.get('/user-branches'),
    select: (data) => data.assignments,
    staleTime: 30_000,
  })
}

export function useUserBranches(userId) {
  return useQuery({
    queryKey: ['users', userId, 'branches'],
    queryFn: () => api.get(`/users/${userId}/branches`),
    select: (data) => data.branches,
    enabled: !!userId,
  })
}

export function useAssignBranch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, branchId }) => api.post(`/users/${userId}/branches`, { branch_id: branchId }),
    onSuccess: (_, { userId }) => {
      qc.invalidateQueries({ queryKey: ['users', userId, 'branches'] })
      qc.invalidateQueries({ queryKey: ['user-branches', 'all'] })
    },
  })
}

export function useUnassignBranch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, branchId }) => api.delete(`/users/${userId}/branches/${branchId}`),
    onSuccess: (_, { userId }) => {
      qc.invalidateQueries({ queryKey: ['users', userId, 'branches'] })
      qc.invalidateQueries({ queryKey: ['user-branches', 'all'] })
    },
  })
}

// ─── Leads ──────────────────────────────────────────────
export function useLeads(filters) {
  return useQuery({
    queryKey: queryKeys.leads(filters),
    queryFn: () => {
      const params = new URLSearchParams()
      if (filters?.company) params.set('company', filters.company)
      if (filters?.type) params.set('type', filters.type)
      if (filters?.status) params.set('status', filters.status)
      if (filters?.branch) params.set('branch', filters.branch)
      if (filters?.source) params.set('source', filters.source)
      if (filters?.search) params.set('search', filters.search)
      if (filters?.date_from) params.set('date_from', filters.date_from)
      if (filters?.date_to) params.set('date_to', filters.date_to)
      if (filters?.page != null) params.set('page', filters.page)
      if (filters?.page_size) params.set('page_size', filters.page_size)
      if (filters?.affiliated_user_id) params.set('affiliated_user_id', filters.affiliated_user_id)
      const qs = params.toString()
      return api.get(`/leads${qs ? '?' + qs : ''}`)
    },
  })
}

export function useLead(id) {
  return useQuery({
    queryKey: queryKeys.lead(id),
    queryFn: () => api.get(`/leads/${id}`),
    select: (data) => data.lead,
    enabled: !!id,
  })
}

export function useLeadCalls(leadId) {
  return useQuery({
    queryKey: ['leads', 'calls', leadId],
    queryFn: () => api.get(`/leads/${leadId}/calls`),
    select: (data) => data.calls,
    enabled: !!leadId,
    staleTime: 60_000,
  })
}

export function useLeadActivities(leadId) {
  return useQuery({
    queryKey: ['leads', 'activities', leadId],
    queryFn: () => api.get(`/leads/${leadId}/activities`),
    select: (data) => data.activities,
    enabled: !!leadId,
    staleTime: 30_000,
  })
}

export function useAddLeadComment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ leadId, comment }) => api.post(`/leads/${leadId}/comment`, { comment }),
    onSuccess: (_, { leadId }) => qc.invalidateQueries({ queryKey: ['leads', 'activities', leadId] }),
  })
}

export function useCreateLead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body) => api.post('/leads', body),
    onSuccess: (data) => {
      // Instantly prepend the new lead to cached queries
      const newLead = data?.lead
      if (newLead) {
        qc.setQueriesData({ queryKey: ['leads'] }, (old) => {
          if (!old?.leads) return old
          return { ...old, leads: [newLead, ...old.leads], total: (old.total || 0) + 1 }
        })
      }
      // Fire-and-forget background refetch (don't block the mutation)
      setTimeout(() => qc.invalidateQueries({ queryKey: ['leads'] }), 100)
    },
  })
}

export function useUpdateLead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }) => api.put(`/leads/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads'] }),
  })
}

export function useDeleteLead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/leads/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads'] }),
  })
}

export function useImportLeads() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (formData) => api.upload('/leads/import', formData),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads'] }),
  })
}

export function useDispatchLead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.post(`/leads/${id}/dispatch`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads'] }),
  })
}

// ─── Lead Field Definitions ─────────────────────────────
export function useLeadFields() {
  return useQuery({
    queryKey: queryKeys.leadFields,
    queryFn: () => api.get('/lead-fields'),
    select: (data) => data.fields,
  })
}

export function useCreateLeadField() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body) => api.post('/lead-fields', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.leadFields }),
  })
}

export function useUpdateLeadField() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }) => api.put(`/lead-fields/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.leadFields }),
  })
}

export function useDeleteLeadField() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/lead-fields/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.leadFields }),
  })
}

// ─── Lead Documents ─────────────────────────────────────
export function useLeadDocuments(leadId) {
  return useQuery({
    queryKey: queryKeys.leadDocuments(leadId),
    queryFn: () => api.get(`/leads/${leadId}/documents`),
    select: (data) => data.documents,
    enabled: !!leadId,
  })
}

export function useUploadLeadDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ leadId, formData }) => api.upload(`/leads/${leadId}/documents`, formData),
    onSuccess: (_, { leadId }) => qc.invalidateQueries({ queryKey: queryKeys.leadDocuments(leadId) }),
  })
}

export function useDeleteLeadDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ leadId, docId }) => api.delete(`/leads/${leadId}/documents/${docId}`),
    onSuccess: (_, { leadId }) => qc.invalidateQueries({ queryKey: queryKeys.leadDocuments(leadId) }),
  })
}

// ─── Lead Affiliations ──────────────────────────────────
export function useLeadAffiliations(leadId) {
  return useQuery({
    queryKey: queryKeys.leadAffiliations(leadId),
    queryFn: () => api.get(`/leads/${leadId}/affiliations`),
    select: (data) => data.affiliations,
    enabled: !!leadId,
  })
}

export function useAddLeadAffiliation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ leadId, userId }) => api.post(`/leads/${leadId}/affiliations`, { user_id: userId }),
    onSuccess: (_, { leadId }) => qc.invalidateQueries({ queryKey: queryKeys.leadAffiliations(leadId) }),
  })
}

export function useRemoveLeadAffiliation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ leadId, userId }) => api.delete(`/leads/${leadId}/affiliations/${userId}`),
    onSuccess: (_, { leadId }) => qc.invalidateQueries({ queryKey: queryKeys.leadAffiliations(leadId) }),
  })
}

// ─── Branches ───────────────────────────────────────────
export function useBranches() {
  return useQuery({
    queryKey: queryKeys.branches,
    queryFn: () => api.get('/branches'),
    select: (data) => data.branches,
  })
}

export function useCreateBranch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body) => api.post('/branches', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.branches }),
  })
}

export function useUpdateBranch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }) => api.put(`/branches/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.branches }),
  })
}

export function useDeleteBranch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/branches/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.branches }),
  })
}

// ─── Calls (Maskyoo) ─────────────────────────────────────
export function useCalls(filters) {
  return useQuery({
    queryKey: queryKeys.calls(filters),
    queryFn: () => {
      const params = new URLSearchParams()
      if (filters?.date_from) params.set('date_from', filters.date_from)
      if (filters?.date_to) params.set('date_to', filters.date_to)
      if (filters?.search) params.set('search', filters.search)
      if (filters?.page != null) params.set('page', filters.page)
      if (filters?.page_size) params.set('page_size', filters.page_size)
      const qs = params.toString()
      return api.get(`/calls${qs ? '?' + qs : ''}`)
    },
  })
}

export function useCallRecording(uuid) {
  return useQuery({
    queryKey: queryKeys.callRecording(uuid),
    queryFn: () => api.get(`/calls/${uuid}/recording`),
    enabled: !!uuid,
    staleTime: 5 * 60_000,
  })
}

export function useCallMetadata(uuid) {
  return useQuery({
    queryKey: queryKeys.callMetadata(uuid),
    queryFn: () => api.get(`/calls/${uuid}/metadata`),
    enabled: !!uuid,
    staleTime: 5 * 60_000,
  })
}

export function useCallSync() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body = {}) => api.post('/calls/sync', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['calls'] }),
  })
}

export function useCallSyncStatus() {
  return useQuery({
    queryKey: queryKeys.callSyncStatus,
    queryFn: () => api.get('/calls/sync/status'),
    staleTime: 60_000,
  })
}

// ─── City-Branch Index ──────────────────────────────────
export function useCityIndex() {
  return useQuery({
    queryKey: queryKeys.cityIndex,
    queryFn: () => api.get('/city-index'),
    select: (data) => data.cities,
  })
}

export function useCreateCityEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body) => api.post('/city-index', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.cityIndex }),
  })
}

export function useDeleteCityEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/city-index/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.cityIndex }),
  })
}

// ─── Dispatch Config ─────────────────────────────────────
export function useDispatchConfig() {
  return useQuery({
    queryKey: queryKeys.dispatchConfig,
    queryFn: () => api.get('/dispatch-config').then(r => r.config),
  })
}

export function useUpdateDispatchConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body) => api.put('/dispatch-config', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.dispatchConfig }),
  })
}

export function useConnectDispatchWhatsApp() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post('/dispatch-config/connect-whatsapp'),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.dispatchConfig }),
  })
}

// ─── Settings ────────────────────────────────────────────
export function useSettings() {
  return useQuery({
    queryKey: queryKeys.settings,
    queryFn: () => api.get('/settings'),
    select: (data) => data.settings,
    staleTime: 5 * 60_000,
  })
}

export function useUpdateSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (settings) => api.put('/settings', { settings }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.settings }),
  })
}

// ─── Maskyoo Orgs & Lines ────────────────────────────────
export function useMaskyooOrgs() {
  return useQuery({
    queryKey: queryKeys.maskyooOrgs,
    queryFn: () => api.get('/maskyoo-orgs').then(r => r.orgs),
  })
}

export function useCreateMaskyooOrg() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body) => api.post('/maskyoo-orgs', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.maskyooOrgs }),
  })
}

export function useUpdateMaskyooOrg() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }) => api.put(`/maskyoo-orgs/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.maskyooOrgs }),
  })
}

export function useDeleteMaskyooOrg() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/maskyoo-orgs/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.maskyooOrgs }),
  })
}

export function useMaskyooLines(orgId) {
  return useQuery({
    queryKey: queryKeys.maskyooLines(orgId),
    queryFn: () => api.get(`/maskyoo-lines${orgId ? `?org_id=${orgId}` : ''}`).then(r => r.lines),
  })
}

export function useUpdateMaskyooLine() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }) => api.put(`/maskyoo-lines/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['maskyoo-lines'] }),
  })
}

export function useDeleteMaskyooLine() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/maskyoo-lines/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['maskyoo-lines'] }),
  })
}

export function useSyncMaskyooLines() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post('/maskyoo-lines/sync'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['maskyoo-lines'] }),
  })
}

// ─── Heartbeat / Active Sessions ─────────────────────────
const SESSION_ID_KEY = '__yedid_session_id'
function getSessionId() {
  let id = sessionStorage.getItem(SESSION_ID_KEY)
  if (!id) {
    id = crypto.randomUUID()
    sessionStorage.setItem(SESSION_ID_KEY, id)
  }
  return id
}

export function useHeartbeat() {
  const [sessions, setSessions] = useState([])
  const sessionId = getSessionId()

  const ping = useCallback(async () => {
    try {
      const data = await api.post('/heartbeat', { session_id: sessionId })
      setSessions(data.sessions || [])
    } catch {}
  }, [sessionId])

  useEffect(() => {
    ping()
    const interval = setInterval(ping, 30_000)
    return () => clearInterval(interval)
  }, [ping])

  return { sessions, sessionId }
}

// ─── Follow-up Config (Relance) ──────────────────────────
export function useFollowupConfig(orgId) {
  return useQuery({
    queryKey: queryKeys.followupConfig(orgId),
    queryFn: () => api.get(`/followup-config${orgId ? `?org_id=${orgId}` : ''}`).then(r => r.config),
  })
}

export function useUpdateFollowupConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body) => api.put('/followup-config', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['followup-config'] }),
  })
}

export function useConnectFollowupWhatsApp() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (orgId) => api.post('/followup-config/connect-whatsapp', { org_id: orgId || null }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['followup-config'] }),
  })
}

export function useFollowupSources(orgId) {
  return useQuery({
    queryKey: queryKeys.followupSources(orgId),
    queryFn: () => api.get(`/followup-config/sources${orgId ? `?org_id=${orgId}` : ''}`).then(r => r.sources),
  })
}

export function useFollowupQueue() {
  return useQuery({
    queryKey: queryKeys.followupQueue,
    queryFn: () => api.get('/followup-config/queue').then(r => r.queue),
    refetchInterval: 60_000,
  })
}

export function useFollowupStats() {
  return useQuery({
    queryKey: queryKeys.followupStats,
    queryFn: () => api.get('/followup-config/stats'),
    refetchInterval: 60_000,
  })
}
