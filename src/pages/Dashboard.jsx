import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useI18n } from '../lib/i18n'
import { api } from '../lib/api'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Database, Bot, Inbox, Users, MessageSquare, CheckCircle, CircleDot, Receipt, Brain } from 'lucide-react'

export default function Dashboard() {
  const { user } = useAuth()
  const { t, dateLocale } = useI18n()
  const navigate = useNavigate()
  const [stats, setStats] = useState({})
  const [sessions, setSessions] = useState([])
  const [sessionStats, setSessionStats] = useState({})
  const [inboxes, setInboxes] = useState([])
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterInbox, setFilterInbox] = useState('all')

  useEffect(() => {
    if (user?.role === 'agent') return

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
      }).catch(() => {})
    }
  }, [user])

  useEffect(() => {
    if (user?.role !== 'admin') return
    const params = new URLSearchParams()
    if (filterStatus !== 'all') params.set('status', filterStatus)
    if (filterInbox !== 'all') params.set('inbox_id', filterInbox)
    const qs = params.toString()
    api.get(`/sessions${qs ? '?' + qs : ''}`).then((data) => {
      setSessions(data.sessions || [])
      setSessionStats(data.stats || {})
    }).catch(() => {})
  }, [user, filterStatus, filterInbox])

  const inboxMap = Object.fromEntries(inboxes.map((i) => [i.id, i.name]))

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
    { labelKey: 'sessions.avgConfidence', value: sessionStats.avg_confidence, icon: Brain },
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
                  <SelectItem key={inbox.id} value={String(inbox.id)}>{inbox.name}</SelectItem>
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
                    <TableRow key={s.id} className="cursor-pointer" onClick={() => navigate(`/inboxes/${s.inbox_id}`)}>
                      <TableCell className="font-medium">{inboxMap[s.inbox_id] || '-'}</TableCell>
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
