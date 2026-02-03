import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../lib/auth'
import { useI18n } from '../lib/i18n'
import { useAgents, useInboxes, useSources, useSessions, useSessionMessages, useUsers } from '../hooks/queries'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { startOfDay, startOfWeek, subDays, startOfMonth, format } from 'date-fns'
import { fr as frLocale } from 'date-fns/locale/fr'
import { enUS } from 'date-fns/locale/en-US'
import { he as heLocale } from 'date-fns/locale/he'

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

const calendarLocales = { fr: frLocale, en: enUS, he: heLocale }
import { Database, Bot, Inbox, Users, MessageSquare, CheckCircle, CircleDot, Brain, User, X, BookOpen, Wrench, Search, AlertTriangle, ArrowUpRight, Clock, TrendingUp, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'

export default function Dashboard() {
  const { user } = useAuth()
  const { t, locale, dateLocale } = useI18n()
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterInbox, setFilterInbox] = useState('all')
  const [filterDateRange, setFilterDateRange] = useState('last30')
  const [customRange, setCustomRange] = useState({ from: undefined, to: undefined })
  const [datePopoverOpen, setDatePopoverOpen] = useState(false)
  const [activeCharts, setActiveCharts] = useState(new Set(['sessions', 'resolved', 'escalated']))
  const [pageSize, setPageSize] = useState(20)
  const [currentPage, setCurrentPage] = useState(0)
  const [selectedSession, setSelectedSession] = useState(null)

  const { dateFrom, dateTo } = useMemo(() => {
    const now = new Date()
    switch (filterDateRange) {
      case 'today':
        return { dateFrom: startOfDay(now).toISOString(), dateTo: now.toISOString() }
      case 'thisWeek':
        return { dateFrom: startOfWeek(now, { weekStartsOn: 1 }).toISOString(), dateTo: now.toISOString() }
      case 'last30':
        return { dateFrom: subDays(now, 30).toISOString(), dateTo: now.toISOString() }
      case 'thisMonth':
        return { dateFrom: startOfMonth(now).toISOString(), dateTo: now.toISOString() }
      case 'custom':
        return {
          dateFrom: customRange.from ? startOfDay(customRange.from).toISOString() : undefined,
          dateTo: customRange.to ? new Date(new Date(customRange.to).setHours(23, 59, 59, 999)).toISOString() : undefined,
        }
      default:
        return { dateFrom: undefined, dateTo: undefined }
    }
  }, [filterDateRange, customRange])

  const selectDatePreset = (preset) => {
    setFilterDateRange(preset)
    if (preset !== 'custom') setDatePopoverOpen(false)
  }

  const dateRangeLabel = {
    today: t('sessions.today'),
    thisWeek: t('sessions.thisWeek'),
    last30: t('sessions.last30'),
    thisMonth: t('sessions.thisMonth'),
    custom: customRange.from
      ? `${format(customRange.from, 'dd/MM/yyyy')}${customRange.to ? ` – ${format(customRange.to, 'dd/MM/yyyy')}` : ''}`
      : t('sessions.custom'),
  }[filterDateRange]

  const toggleChart = (key) => {
    setActiveCharts((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Data hooks — called unconditionally (React rules of hooks)
  const { data: agents = [], isLoading: agentsLoading } = useAgents()
  const { data: inboxes = [], isLoading: inboxesLoading } = useInboxes()
  const { data: sourcesData = [], isLoading: sourcesLoading } = useSources()
  const { data: usersData = [], isLoading: usersLoading } = useUsers()
  const { data: sessionData } = useSessions({ status: filterStatus, inbox_id: filterInbox, date_from: dateFrom, date_to: dateTo })
  const { data: panelMessages = [], isLoading: messagesLoading } = useSessionMessages(selectedSession?.id)

  const sessions = sessionData?.sessions || []
  const sessionStats = sessionData?.stats || {}
  const chartData = useMemo(() => {
    const raw = sessionData?.chart || []
    return raw.map((d) => ({
      ...d,
      label: format(new Date(d.date + 'T00:00:00'), 'dd/MM'),
      other: Math.max(0, d.sessions - d.resolved - d.escalated),
    }))
  }, [sessionData?.chart])

  const totalPages = Math.max(1, Math.ceil(sessions.length / pageSize))
  const safePage = Math.min(currentPage, totalPages - 1)
  const paginatedSessions = sessions.slice(safePage * pageSize, (safePage + 1) * pageSize)

  useEffect(() => { setCurrentPage(0) }, [filterStatus, filterInbox, dateFrom, dateTo, pageSize])

  const inboxMap = Object.fromEntries(inboxes.map((i) => [i.inbox_id, i.name]))

  const closeSession = () => {
    setSelectedSession(null)
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

  // Compute stats from hook data
  const stats = user?.role === 'admin'
    ? { agents: agents.length, inboxes: inboxes.length, sources: sourcesData.length }
    : user?.role === 'super_admin'
      ? { users: usersData.length, comptes_chatwoot: usersData.filter((u) => u.chatwoot_accounts).length }
      : {}

  const superAdminCards = [
    { labelKey: 'dashboard.users', value: stats.users, icon: Users },
    { labelKey: 'dashboard.chatwootAccounts', value: stats.comptes_chatwoot, icon: Inbox },
  ]

  const sessionStatCards = [
    { labelKey: 'sessions.totalAiMessages', value: sessionStats.total_ai_messages, icon: MessageSquare, chartKey: 'ai_messages', chartColor: '#8b5cf6' },
    { labelKey: 'sessions.totalSessions', value: sessionStats.total, icon: CircleDot, chartKey: 'sessions', chartColor: '#2383E2' },
    { labelKey: 'sessions.resolved', value: sessionStats.resolved, icon: CheckCircle, chartKey: 'resolved', chartColor: '#10b981' },
    { labelKey: 'sessions.escalated', value: sessionStats.escalated, icon: ArrowUpRight, chartKey: 'escalated', chartColor: '#f97316' },
    { labelKey: 'sessions.resolutionRate', value: sessionStats.resolution_rate != null ? `${sessionStats.resolution_rate}%` : '-', icon: TrendingUp },
    { labelKey: 'sessions.avgFirstResponse', value: formatDuration(sessionStats.avg_first_response), icon: Clock },
  ]

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">{t('dashboard.title')}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t('dashboard.welcome', { name: user?.first_name || user?.email })}
        </p>
      </div>

      {user?.role === 'super_admin' && (
        <div className="grid gap-4 grid-cols-2">
          {superAdminCards.map((card) => {
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
                {messagesLoading ? (
                  <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
                ) : panelMessages.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('sessions.noMessages')}</p>
                ) : (
                  <div className="space-y-4">
                    {panelMessages.map((m) => (
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

                          {/* Metadata badges — only on assistant messages */}
                          {m.role === 'assistant' && (m.playbook_title || m.escalation_title || m.metadata) && (
                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                              {m.playbook_title && (
                                <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                                  <BookOpen size={10} /> {m.playbook_title}
                                </span>
                              )}
                              {m.escalation_title && (
                                <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-600 dark:text-orange-400">
                                  <AlertTriangle size={10} /> {m.escalation_title}
                                </span>
                              )}
                              {m.metadata?.kb_searches?.map((kb, i) => (
                                <span key={`kb-${i}`} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                                  <Search size={10} /> KB: "{kb.query}" ({kb.results_count} {t('sessions.metaResults')})
                                </span>
                              ))}
                              {m.metadata?.tool_calls?.map((tc, i) => (
                                <span key={`tc-${i}`} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-600 dark:text-violet-400">
                                  <Wrench size={10} /> {tc.name}
                                </span>
                              ))}
                              {m.metadata?.resume && (
                                <div className="w-full text-[11px] mt-1 p-2 rounded bg-orange-500/5 text-orange-600 dark:text-orange-400 border border-orange-500/10">
                                  <span className="font-medium">{t('sessions.metaSummary')}:</span> {m.metadata.resume}
                                </div>
                              )}
                            </div>
                          )}
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
          <div className="flex gap-3 mb-4 flex-wrap items-center">
            <h2 className="text-lg font-semibold tracking-tight mr-auto">{t('sessions.title')}</h2>

            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('sessions.allStatuses')}</SelectItem>
                <SelectItem value="open">{t('sessions.statusOpen')}</SelectItem>
                <SelectItem value="escalated">{t('sessions.statusEscalated')}</SelectItem>
                <SelectItem value="resolved">{t('sessions.statusResolved')}</SelectItem>
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

            <Popover open={datePopoverOpen} onOpenChange={setDatePopoverOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="gap-2 h-9 px-3 text-sm">
                  <CalendarDays size={14} />
                  {dateRangeLabel}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <div className="flex flex-col">
                  <div className="flex flex-col gap-0.5 p-2">
                    {['today', 'thisWeek', 'last30', 'thisMonth', 'custom'].map((preset) => (
                      <button
                        key={preset}
                        onClick={() => selectDatePreset(preset)}
                        className={`text-left text-sm px-3 py-1.5 rounded-md transition-colors hover:bg-accent ${filterDateRange === preset ? 'bg-accent font-medium' : ''}`}
                      >
                        {t(`sessions.${preset}`)}
                      </button>
                    ))}
                  </div>
                  {filterDateRange === 'custom' && (
                    <div className="border-t p-2">
                      <Calendar
                        mode="range"
                        locale={calendarLocales[locale]}
                        selected={customRange}
                        onSelect={(range) => setCustomRange(range || { from: undefined, to: undefined })}
                        numberOfMonths={1}
                      />
                    </div>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
            {sessionStatCards.map((card) => {
              const Icon = card.icon
              const isActive = card.chartKey && activeCharts.has(card.chartKey)
              return (
                <Card
                  key={card.labelKey}
                  className={`transition-all hover:shadow-soft-md ${card.chartKey ? 'cursor-pointer select-none' : ''}`}
                  style={isActive ? { borderColor: card.chartColor, background: `${card.chartColor}08` } : undefined}
                  onClick={card.chartKey ? () => toggleChart(card.chartKey) : undefined}
                >
                  <CardHeader className="flex flex-row items-start justify-between pb-2">
                    <CardTitle className={`text-sm font-medium leading-tight min-h-[2rem] ${isActive ? '' : 'text-muted-foreground'}`} style={isActive ? { color: card.chartColor } : undefined}>{t(card.labelKey)}</CardTitle>
                    <Icon size={16} className={`shrink-0 mt-0.5 ${isActive ? '' : 'text-muted-foreground'}`} style={isActive ? { color: card.chartColor } : undefined} />
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-semibold tracking-tight">{card.value ?? 0}</div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {chartData.length > 0 && (
            <div className="mb-6">
              <div className="pt-2 pr-2">
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="gradAiMessages" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.05} />
                      </linearGradient>
                      <linearGradient id="gradSessions" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#2383E2" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#2383E2" stopOpacity={0.05} />
                      </linearGradient>
                      <linearGradient id="gradResolved" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0.05} />
                      </linearGradient>
                      <linearGradient id="gradEscalated" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f97316" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#f97316" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} width={32} />
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'hsl(var(--popover))', color: 'hsl(var(--popover-foreground))' }}
                      labelFormatter={(label) => label}
                    />
                    {activeCharts.has('ai_messages') && (
                      <Area type="monotone" dataKey="ai_messages" fill="url(#gradAiMessages)" stroke="#8b5cf6" strokeWidth={1.5} name={t('sessions.totalAiMessages')} />
                    )}
                    {activeCharts.has('sessions') && (
                      <Area type="monotone" dataKey="sessions" fill="url(#gradSessions)" stroke="#2383E2" strokeWidth={1.5} name={t('sessions.totalSessions')} />
                    )}
                    {activeCharts.has('resolved') && (
                      <Area type="monotone" dataKey="resolved" fill="url(#gradResolved)" stroke="#10b981" strokeWidth={1.5} name={t('sessions.resolved')} />
                    )}
                    {activeCharts.has('escalated') && (
                      <Area type="monotone" dataKey="escalated" fill="url(#gradEscalated)" stroke="#f97316" strokeWidth={1.5} name={t('sessions.escalated')} />
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <Card>
            <Table className="[&_th:first-child]:pl-3 [&_td:first-child]:pl-3">
              <TableHeader>
                <TableRow>
                  <TableHead>{t('sessions.inbox')}</TableHead>
                  <TableHead>{t('common.status')}</TableHead>
                  <TableHead className="max-w-[160px]">{t('sessions.playbook')}</TableHead>
                  <TableHead>{t('sessions.messages')}</TableHead>
                  <TableHead>{t('sessions.confidence')}</TableHead>
                  <TableHead>{t('sessions.duration')}</TableHead>
                  <TableHead>{t('common.date')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedSessions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                      {t('sessions.empty')}
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedSessions.map((s) => {
                    const isEscalated = s.ai_reason?.startsWith('ESCALATION:')
                    const isResolved = s.billable
                    const isOpen = s.status === 'open'
                    let statusLabel, statusClass
                    if (isOpen) { statusLabel = t('sessions.statusOpen'); statusClass = 'bg-primary/10 text-primary hover:bg-primary/10' }
                    else if (isEscalated) { statusLabel = t('sessions.statusEscalated'); statusClass = 'bg-orange-500/10 text-orange-600 dark:text-orange-400 hover:bg-orange-500/10' }
                    else if (isResolved) { statusLabel = t('sessions.statusResolved'); statusClass = 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10' }
                    else { statusLabel = t('sessions.statusClosed'); statusClass = 'bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/10' }
                    return (
                      <TableRow key={s.id} className="cursor-pointer" onClick={() => setSelectedSession(s)}>
                        <TableCell className="font-medium">{inboxMap[s.chatwoot_inbox_id] || '-'}</TableCell>
                        <TableCell>
                          <Badge className={`${statusClass} border-0`}>{statusLabel}</Badge>
                        </TableCell>
                        <TableCell className="max-w-[160px] truncate text-muted-foreground">{s.dominant_playbook || '-'}</TableCell>
                        <TableCell>{s.message_count}</TableCell>
                        <TableCell>{s.ai_confidence != null ? `${Math.round(s.ai_confidence * 100)}%` : '-'}</TableCell>
                        <TableCell className="text-muted-foreground">{formatDuration(s.duration_seconds)}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(s.created_at).toLocaleString(dateLocale)}
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
            {sessions.length > 0 && (
              <div className="flex items-center justify-between px-4 py-3 border-t">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>{t('sessions.rowsPerPage')}</span>
                  <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                    <SelectTrigger className="w-[70px] h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="20">20</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>{safePage * pageSize + 1}–{Math.min((safePage + 1) * pageSize, sessions.length)} / {sessions.length}</span>
                  <Button variant="ghost" size="icon" className="h-8 w-8" disabled={safePage === 0} onClick={() => setCurrentPage(safePage - 1)}>
                    <ChevronLeft size={14} />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" disabled={safePage >= totalPages - 1} onClick={() => setCurrentPage(safePage + 1)}>
                    <ChevronRight size={14} />
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  )
}
