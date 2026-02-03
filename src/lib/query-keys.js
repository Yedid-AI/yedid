export const queryKeys = {
  agents: ['agents'],
  agent: (id) => ['agents', id],

  // Legacy (agent-scoped) — kept for backward compatibility
  playbooks: (agentBotId) => ['agents', agentBotId, 'playbooks'],
  tools: (agentBotId) => ['agents', agentBotId, 'tools'],
  escalationRules: (agentBotId) => ['agents', agentBotId, 'escalation-rules'],

  // Shared libraries (user-scoped)
  playbooksLibrary: ['playbooks-library'],
  toolsLibrary: ['tools-library'],
  escalationRulesLibrary: ['escalation-rules-library'],

  // Agent ↔ library associations
  agentPlaybooks: (id) => ['agents', id, 'assoc-playbooks'],
  agentEscalationRules: (id) => ['agents', id, 'assoc-escalation'],

  inboxes: ['inboxes'],
  inbox: (id) => ['inboxes', id],
  inboxChatwoot: (id) => ['inboxes', id, 'chatwoot'],
  inboxMembers: (id) => ['inboxes', id, 'members'],
  whatsappStatus: (id) => ['inboxes', id, 'whatsapp-status'],
  chatwootAgents: ['chatwoot-agents'],

  sessions: (filters) => ['sessions', filters || {}],
  session: (id) => ['sessions', 'detail', id],
  sessionMessages: (id) => ['sessions', 'detail', id, 'messages'],

  sources: ['sources'],

  users: ['users'],
  user: (id) => ['users', id],

  settings: ['settings'],
}
