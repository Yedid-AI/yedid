import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { queryKeys } from '../lib/query-keys'

// ─── Agents ──────────────────────────────────────────────
export function useAgents() {
  return useQuery({
    queryKey: queryKeys.agents,
    queryFn: () => api.get('/agent-bots'),
    select: (data) => data.agent_bots,
    refetchInterval: 30_000,
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
    refetchInterval: 30_000,
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
    refetchInterval: 30_000,
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
    refetchInterval: 30_000,
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
    refetchInterval: 30_000,
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
    refetchInterval: 10_000,
  })
}

export function useSession(id) {
  return useQuery({
    queryKey: queryKeys.session(id),
    queryFn: () => api.get(`/sessions/${id}`),
    select: (data) => data.session,
    enabled: !!id,
    refetchInterval: 10_000,
  })
}

export function useSessionMessages(id) {
  return useQuery({
    queryKey: queryKeys.sessionMessages(id),
    queryFn: () => api.get(`/sessions/${id}/messages`),
    select: (data) => data.messages || [],
    enabled: !!id,
    refetchInterval: 10_000,
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
export function useUsers() {
  return useQuery({
    queryKey: queryKeys.users,
    queryFn: () => api.get('/users'),
    select: (data) => data.users,
    refetchInterval: 60_000,
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
