export const queryKeys = {
  agents: ['agents'],
  agent: (id) => ['agents', id],

  playbooks: (agentBotId) => ['agents', agentBotId, 'playbooks'],
  tools: (agentBotId) => ['agents', agentBotId, 'tools'],
  escalationRules: (agentBotId) => ['agents', agentBotId, 'escalation-rules'],

  inboxes: ['inboxes'],
  inbox: (id) => ['inboxes', id],

  sessions: (filters) => ['sessions', filters || {}],
  session: (id) => ['sessions', 'detail', id],
  sessionMessages: (id) => ['sessions', 'detail', id, 'messages'],

  sources: ['sources'],

  users: ['users'],
  user: (id) => ['users', id],

  settings: ['settings'],
}
