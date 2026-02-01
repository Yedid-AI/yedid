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
