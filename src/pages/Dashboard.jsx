import { useState, useEffect } from 'react'
import { useAuth } from '../lib/auth'
import { useI18n } from '../lib/i18n'
import { api } from '../lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Database, Bot, Inbox, Users, MessageSquare, CheckCircle, CircleDot, Receipt, Brain, User, X } from 'lucide-react'

export default function Dashboard() {
  const { user } = useAuth()
  const { t, dateLocale } = useI18n()
  const [stats, setStats] = useState({})
  const [sessions, setSessions] = useState([])
  const [sessionStats, setSessionStats] = useState({})
  const [inboxes, setInboxes] = useState([])
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterInbox, setFilterInbox] = useState('all')
  const [ready, setReady] = useState(false)
  const [selectedSession, setSelectedSession] = useState(null)
  const [sessionMessages, setSessionMessages] = useState([])
  const [sessionLoading, setSessionLoading] = useState(false)

  useEffect(() => {
    if (user?.role === 'agent') {
      setReady(true)
      return
    }

    if (user?.role === 'admin') {
      Promise.all([
        api.get('/agent-bots').catch(() => ({ agent_bots: [] })),
        api.get('/inboxes').catch(() => ({ inboxes: [] })),
        api.get('/sources').catch(() => ({ sources: [] })),
      ]).then(([a, i, s]) => {
        setStats({
          agents: a.agent_bots?.length || 0,
          inboxes: i.inboxes?.length || 0,
          sources: s.sources?.length || 0,
        })
        setInboxes(i.inboxes || [])
        setReady(true)
      })
    }

    if (user?.role === 'super_admin') {
      api.get('/users').then((data) => {
        const users = data.users || []
        const withChatwoot = users.filter((u) => u.chatwoot_accounts).length
        setStats({
          users: users.length,
          comptes_chatwoot: withChatwoot,
        })
        setReady(true)
      }).catch(() => setReady(true))
    }
  }, [user])

  useEffect(() => {
    if (user?.role !== 'admin' || !ready) return
    const params = new URLSearchParams()
    if (filterStatus !== 'all') params.set('status', filterStatus)
    if (filterInbox !== 'all') params.set('inbox_id', filterInbox)
    const qs = params.toString()
    api.get(`/sessions${qs ? '?' + qs : ''}`).then((data) => {
      setSessions(data.sessions || [])
      setSessionStats(data.stats || {})
    }).catch(() => {})
  }, [user, filterStatus, filterInbox, ready])

  const inboxMap = Object.fromEntries(inboxes.map((i) => [i.inbox_id, i.name]))

  const openSession = (session) => {
    setSelectedSession(session)
    setSessionLoading(true)
    api.get(`/sessions/${session.id}/messages`)
      .then((data) => setSessionMessages(data.messages || []))
      .catch(() => setSessionMessages([]))
      .finally(() => setSessionLoading(false))
  }

  const closeSession = () => {
    setSelectedSession(null)
    setSessionMessages([])
  }

  useEffect(() => {
    if (!selectedSession) return
    const handleEscape = (e) => { if (e.key === 'Escape') closeSession() }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [selectedSession])

  const formatDuration = (seconds) => {
    if (seconds == null) return '-'
    if (seconds < 60) return `${seconds}s`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    return `${h}h ${m}m`
  }

  const adminCards = [
    { labelKey: 'dashboard.agents', value: stats.agents, icon: Bot },
    { labelKey: 'dashboard.inboxes', value: stats.inboxes, icon: Inbox },
    { labelKey: 'dashboard.sources', value: stats.sources, icon: Database },
  ]

  const superAdminCards = [
    { labelKey: 'dashboard.users', value: stats.users, icon: Users },
    { labelKey: 'dashboard.chatwootAccounts', value: stats.comptes_chatwoot, icon: Inbox },
  ]

  const sessionStatCards = [
    { labelKey: 'sessions.total', value: sessionStats.total, icon: MessageSquare },
    { labelKey: 'sessions.open', value: sessionStats.open, icon: CircleDot },
    { labelKey: 'sessions.closed', value: sessionStats.closed, icon: CheckCircle },
    { labelKey: 'sessions.billable', value: sessionStats.billable, icon: Receipt },
    { labelKey: 'sessions.avgConfidence', value: sessionStats.avg_confidence != null ? `${Math.round(sessionStats.avg_confidence * 100)}%` : '-', icon: Brain },
  ]

  const cards = user?.role === 'super_admin' ? superAdminCards : adminCards

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">{t('dashboard.title')}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t('dashboard.welcome', { name: user?.first_name || user?.email })}
        </p>
      </div>

      {user?.role !== 'agent' && (
        <div className={`grid gap-4 ${cards.length <= 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
          {cards.map((card) => {
            const Icon = card.icon
            return (
              <Card key={card.labelKey} className="hover:shadow-soft-md">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{t(card.labelKey)}</CardTitle>
                  <Icon size={16} className="text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-semibold tracking-tight">{card.value ?? 0}</div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {selectedSession && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" onClick={closeSession} />
          <div className="absolute right-0 top-0 h-full w-full max-w-lg bg-background border-l shadow-soft-xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
              <div>
                <h2 className="text-lg font-semibold">{t('sessions.detail')}</h2>
                <p className="text-xs text-muted-foreground">
                  {t('sessions.sessionId', { id: String(selectedSession.id).slice(0, 8) })} — {new Date(selectedSession.created_at).toLocaleString(dateLocale)}
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={closeSession}>
                <X size={16} />
              </Button>
            </div>

            <div className="flex-1 overflow-auto px-6 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Card>
                  <CardContent className="pt-3 pb-3">
                    <div className="text-xs text-muted-foreground">{t('common.status')}</div>
                    <Badge variant={selectedSession.status === 'open' ? 'default' : 'secondary'} className="mt-1">
                      {selectedSession.status === 'open' ? t('sessions.statusOpen') : t('sessions.statusClosed')}
                    </Badge>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-3 pb-3">
                    <div className="text-xs text-muted-foreground">{t('sessions.billableCol')}</div>
                    <div className="text-sm font-semibold mt-1">{selectedSession.billable ? t('common.yes') : t('common.no')}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-3 pb-3">
                    <div className="text-xs text-muted-foreground">{t('sessions.confidence')}</div>
                    <div className="text-sm font-semibold mt-1">
                      {selectedSession.ai_confidence != null ? `${Math.round(selectedSession.ai_confidence * 100)}%` : '-'}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-3 pb-3">
                    <div className="text-xs text-muted-foreground">{t('sessions.duration')}</div>
                    <div className="text-sm font-semibold mt-1">{formatDuration(selectedSession.duration_seconds)}</div>
                  </CardContent>
                </Card>
              </div>

              {inboxMap[selectedSession.chatwoot_inbox_id] && (
                <div className="text-xs text-muted-foreground">
                  {t('sessions.inbox')} : <span className="font-medium text-foreground">{inboxMap[selectedSession.chatwoot_inbox_id]}</span>
                </div>
              )}

              {selectedSession.ai_reason && (
                <Card>
                  <CardContent className="pt-3 pb-3">
                    <div className="text-xs text-muted-foreground mb-1">{t('sessions.aiReason')}</div>
                    <p className="text-sm">{selectedSession.ai_reason}</p>
                  </CardContent>
                </Card>
              )}

              <div>
                <h3 className="text-sm font-semibold mb-3">{t('sessions.conversation')}</h3>
                {sessionLoading ? (
                  <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
                ) : sessionMessages.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('sessions.noMessages')}</p>
                ) : (
                  <div className="space-y-3">
                    {sessionMessages.map((m) => (
                      <div key={m.id} className="flex gap-2.5">
                        <div className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${m.role === 'user' ? 'bg-muted' : 'bg-primary/10'}`}>
                          {m.role === 'user' ? <User size={12} /> : <Bot size={12} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-xs font-medium">{m.role === 'user' ? 'Client' : 'Agent'}</span>
                            <span className="text-xs text-muted-foreground">{new Date(m.created_at).toLocaleString(dateLocale)}</span>
                          </div>
                          <p className="text-sm whitespace-pre-wrap">{m.content}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {user?.role === 'admin' && (
        <div className="mt-10">
          <h2 className="text-lg font-semibold tracking-tight mb-4">{t('sessions.title')}</h2>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            {sessionStatCards.map((card) => {
              const Icon = card.icon
              return (
                <Card key={card.labelKey} className="hover:shadow-soft-md">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">{t(card.labelKey)}</CardTitle>
                    <Icon size={16} className="text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-semibold tracking-tight">{card.value ?? 0}</div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          <div className="flex gap-3 mb-4">
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('sessions.allStatuses')}</SelectItem>
                <SelectItem value="open">{t('sessions.statusOpen')}</SelectItem>
                <SelectItem value="closed">{t('sessions.statusClosed')}</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterInbox} onValueChange={setFilterInbox}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('sessions.allInboxes')}</SelectItem>
                {inboxes.map((inbox) => (
                  <SelectItem key={inbox.id} value={String(inbox.inbox_id)}>{inbox.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('sessions.inbox')}</TableHead>
                  <TableHead>{t('common.status')}</TableHead>
                  <TableHead>{t('sessions.messages')}</TableHead>
                  <TableHead>{t('sessions.billableCol')}</TableHead>
                  <TableHead>{t('sessions.confidence')}</TableHead>
                  <TableHead>{t('sessions.duration')}</TableHead>
                  <TableHead>{t('common.date')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                      {t('sessions.empty')}
                    </TableCell>
                  </TableRow>
                ) : (
                  sessions.map((s) => (
                    <TableRow key={s.id} className="cursor-pointer" onClick={() => openSession(s)}>
                      <TableCell className="font-medium">{inboxMap[s.chatwoot_inbox_id] || '-'}</TableCell>
                      <TableCell>
                        <Badge variant={s.status === 'open' ? 'default' : 'secondary'}>
                          {s.status === 'open' ? t('sessions.statusOpen') : t('sessions.statusClosed')}
                        </Badge>
                      </TableCell>
                      <TableCell>{s.message_count}</TableCell>
                      <TableCell>{s.billable ? t('common.yes') : t('common.no')}</TableCell>
                      <TableCell>{s.ai_confidence != null ? `${Math.round(s.ai_confidence * 100)}%` : '-'}</TableCell>
                      <TableCell className="text-muted-foreground">{formatDuration(s.duration_seconds)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(s.created_at).toLocaleString(dateLocale)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </div>
      )}
    </div>
  )
}
