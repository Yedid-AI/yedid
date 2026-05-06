import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useI18n } from '../lib/i18n'
import { usePageTitle } from '../lib/page-header'
import {
  useUsers, useLeads, useLeadsStats, useSessions, useCalls,
  useFollowupStats, useBranches, useDispatchConfig,
} from '../hooks/queries'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { format } from 'date-fns'
import { useDateRange } from '../hooks/use-date-range'
import { fr as frLocale } from 'date-fns/locale/fr'
import { enUS } from 'date-fns/locale/en-US'
import { he as heLocale } from 'date-fns/locale/he'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import {
  Users, MessageSquare, CheckCircle, CircleDot, Clock, TrendingUp,
  CalendarDays, Phone, PhoneIncoming, Send, Building2, Briefcase,
  Link2, Check, ChevronRight, UserCheck, Hourglass, Sparkles, TrendingDown,
} from 'lucide-react'

const calendarLocales = { fr: frLocale, en: enUS, he: heLocale }

const STATUS_COLOR = {
  new: '#3b82f6',
  sent_to_branch: '#eab308',
  in_progress: '#f97316',
  interview_scheduled: '#eab308',
  interview_passed: '#06b6d4',
  awaiting_placement: '#f97316',
  handled: '#10b981',
  not_relevant: '#6b7280',
  no_answer: '#ef4444',
  queued_for_dispatch: '#a855f7',
}

const SOURCE_COLOR = '#2383E2'
const TYPE_COLOR = '#8b5cf6'

function formatDuration(seconds) {
  if (seconds == null) return '—'
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h < 24 ? `${h}h${m ? ` ${m}m` : ''}` : `${Math.floor(h / 24)}j`
}

function pct(num, den) {
  if (!den) return null
  return Math.round((num / den) * 100)
}

// ─── Reusable bits ─────────────────────────────────────

function StatCard({ label, value, sub, icon: Icon, color, delta }) {
  return (
    <Card className="hover:shadow-soft-md transition-all">
      <CardHeader className="flex flex-row items-start justify-between pb-2 space-y-0">
        <CardTitle className="text-sm font-medium text-muted-foreground leading-tight">{label}</CardTitle>
        {Icon && <Icon size={16} className="text-muted-foreground shrink-0" style={color ? { color } : undefined} />}
      </CardHeader>
      <CardContent className="pb-4">
        <div className="text-3xl font-semibold tracking-tight" style={color ? { color } : undefined}>{value ?? 0}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
        {delta != null && (
          <div className={`text-xs mt-1 inline-flex items-center gap-1 ${delta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {delta >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            {delta >= 0 ? '+' : ''}{delta}%
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Section({ title, action, children }) {
  return (
    <section className="mt-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function DateRangeFilter({ value, onChange, customRange, setCustomRange, t, locale }) {
  const [open, setOpen] = useState(false)
  const dateRangeLabel = {
    today: t('sessions.today'),
    thisWeek: t('sessions.thisWeek'),
    last30: t('sessions.last30'),
    thisMonth: t('sessions.thisMonth'),
    custom: customRange.from
      ? `${format(customRange.from, 'dd/MM/yyyy')}${customRange.to ? ` – ${format(customRange.to, 'dd/MM/yyyy')}` : ''}`
      : t('sessions.custom'),
  }[value]

  const select = (preset) => {
    onChange(preset)
    if (preset !== 'custom') setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
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
                onClick={() => select(preset)}
                className={`text-start text-sm px-3 py-1.5 rounded-md transition-colors hover:bg-accent ${value === preset ? 'bg-accent font-medium' : ''}`}
              >
                {t(`sessions.${preset}`)}
              </button>
            ))}
          </div>
          {value === 'custom' && (
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
  )
}

// Tiny horizontal bar list used for distributions (source, branch, type, etc.)
function DistributionList({ items, total, valueLabel, color = SOURCE_COLOR, emptyLabel }) {
  if (!items?.length) return <div className="text-sm text-muted-foreground py-6 text-center">{emptyLabel}</div>
  const max = Math.max(...items.map(i => i.value), 1)
  return (
    <div className="space-y-2">
      {items.map((item) => {
        const w = Math.max(2, Math.round((item.value / max) * 100))
        const ratio = total ? Math.round((item.value / total) * 100) : 0
        return (
          <div key={item.key} className="space-y-0.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium truncate me-2">{item.label}</span>
              <span className="text-muted-foreground tabular-nums shrink-0">
                {item.value} {valueLabel ? <span className="ms-0.5 opacity-60">({ratio}%)</span> : null}
              </span>
            </div>
            <div className="h-1.5 bg-muted/50 rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${w}%`, background: item.color || color }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Super admin ──────────────────────────────────────

function SuperAdminView({ t }) {
  const { data: users = [] } = useUsers()
  const { data: sessionData } = useSessions({ status: 'all', inbox_id: 'all' })
  const { data: callsData } = useCalls({ page_size: 1 })

  const roleCounts = users.reduce((acc, u) => {
    acc[u.role] = (acc[u.role] || 0) + 1
    return acc
  }, {})
  const enterpriseCounts = users.reduce((acc, u) => {
    const k = u.enterprise || 'yedid'
    acc[k] = (acc[k] || 0) + 1
    return acc
  }, {})

  const sessionStats = sessionData?.stats || {}

  const cards = [
    { labelKey: 'dashboard.users', value: users.length, icon: Users, color: '#2383E2' },
    { labelKey: 'dashboard.admins', value: roleCounts.admin || 0, icon: UserCheck, color: '#10b981' },
    { labelKey: 'dashboard.marketers', value: roleCounts.marketeur || 0, icon: Briefcase, color: '#8b5cf6' },
    { labelKey: 'dashboard.branchUsers', value: roleCounts.branch || 0, icon: Building2, color: '#f97316' },
    { labelKey: 'dashboard.totalSessions', value: sessionStats.total ?? 0, icon: MessageSquare, color: '#06b6d4' },
    { labelKey: 'dashboard.totalCalls', value: callsData?.total ?? 0, icon: Phone, color: '#eab308' },
  ]

  return (
    <>
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        {cards.map((c) => (
          <StatCard key={c.labelKey} label={t(c.labelKey)} value={c.value} icon={c.icon} color={c.color} />
        ))}
      </div>

      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 mt-6">
        <Card>
          <CardHeader><CardTitle className="text-sm">{t('dashboard.usersByEnterprise')}</CardTitle></CardHeader>
          <CardContent>
            <DistributionList
              items={Object.entries(enterpriseCounts).map(([k, v]) => ({ key: k, label: k, value: v }))}
              total={users.length}
              valueLabel
              emptyLabel={t('dashboard.noData')}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">{t('dashboard.usersByRole')}</CardTitle></CardHeader>
          <CardContent>
            <DistributionList
              items={Object.entries(roleCounts).map(([k, v]) => ({ key: k, label: k, value: v }))}
              total={users.length}
              valueLabel
              emptyLabel={t('dashboard.noData')}
            />
          </CardContent>
        </Card>
      </div>
    </>
  )
}

// ─── Admin (main view) ────────────────────────────────

function AdminView({ t, locale, dateLocale }) {
  const [filterDateRange, setFilterDateRange] = useState('last30')
  const [customRange, setCustomRange] = useState({ from: undefined, to: undefined })
  const { dateFrom, dateTo } = useDateRange(filterDateRange, customRange)

  const { data: stats, isLoading: statsLoading } = useLeadsStats({ date_from: dateFrom, date_to: dateTo })
  const { data: sessionData } = useSessions({ status: 'all', inbox_id: 'all', date_from: dateFrom, date_to: dateTo })
  const { data: callsData } = useCalls({ date_from: dateFrom, date_to: dateTo, page_size: 1 })
  const { data: followupStats } = useFollowupStats()
  const { data: branches = [] } = useBranches()
  const { data: dispatchConfig } = useDispatchConfig()
  const { data: recentLeadsData } = useLeads({ page: 0, page_size: 8, date_from: dateFrom, date_to: dateTo })

  const status = stats?.status || {}
  const total = stats?.total || 0
  const handled = status.handled || 0
  const lost = (status.not_relevant || 0) + (status.no_answer || 0)
  const inProgress = (status.in_progress || 0) + (status.sent_to_branch || 0) + (status.interview_scheduled || 0) + (status.awaiting_placement || 0)
  const sessionStats = sessionData?.stats || {}
  const dispatch = stats?.dispatch || { branches: 0, dispatch_enabled: 0, missing_whatsapp: 0, queued: 0 }

  const conversion = pct(handled, total)
  const escalationRate = pct(sessionStats.escalated, sessionStats.total)

  const kpis = [
    { label: t('dashboard.kpiNewLeads'), value: status.new || 0, icon: CircleDot, color: STATUS_COLOR.new, sub: t('dashboard.leadsTotal', { count: total }) },
    { label: t('dashboard.kpiInProgress'), value: inProgress, icon: Clock, color: STATUS_COLOR.in_progress },
    { label: t('dashboard.kpiHandled'), value: handled, icon: CheckCircle, color: STATUS_COLOR.handled },
    { label: t('dashboard.kpiConversion'), value: conversion != null ? `${conversion}%` : '—', icon: TrendingUp, color: '#10b981', sub: t('dashboard.kpiConversionSub') },
    { label: t('dashboard.kpiCalls'), value: callsData?.total ?? 0, icon: Phone, color: '#eab308' },
    { label: t('dashboard.kpiSessions'), value: sessionStats.total ?? 0, icon: Sparkles, color: '#8b5cf6', sub: escalationRate != null ? t('dashboard.kpiEscalationSub', { rate: escalationRate }) : null },
  ]

  // Build chart data from server series + sessions chart
  const chartData = useMemo(() => {
    const series = stats?.series || []
    return series.map(d => ({
      ...d,
      label: format(new Date(d.date + 'T00:00:00'), 'dd/MM'),
    }))
  }, [stats?.series])

  // Status distribution rows
  const statusRows = [
    'new', 'sent_to_branch', 'in_progress', 'interview_scheduled',
    'interview_passed', 'awaiting_placement', 'handled', 'not_relevant', 'no_answer',
  ].filter(s => status[s])
    .map(s => ({ key: s, label: t(`leads.status_${s}`), value: status[s], color: STATUS_COLOR[s] }))

  const sourceItems = (stats?.by_source || []).map(s => ({ key: s.source, label: s.source, value: s.count, color: SOURCE_COLOR }))
  const branchItems = (stats?.by_branch || []).map(b => ({ key: b.branch, label: b.branch, value: b.count, color: '#f97316', handled: b.handled }))
  const typeItems = Object.entries(stats?.by_type || {}).map(([k, v]) => ({ key: k, label: t(`leads.type_${k}`) !== `leads.type_${k}` ? t(`leads.type_${k}`) : k, value: v, color: TYPE_COLOR }))
  const companyItems = Object.entries(stats?.by_company || {}).map(([k, v]) => ({ key: k, label: k, value: v, color: '#06b6d4' }))

  const dispatchOk = dispatch.branches > 0 && dispatch.missing_whatsapp === 0
  const followupReady = !!followupStats?.today

  const recentLeads = recentLeadsData?.leads || []

  return (
    <>
      {/* Filter bar */}
      <div className="flex items-center justify-end mb-4">
        <DateRangeFilter
          value={filterDateRange}
          onChange={setFilterDateRange}
          customRange={customRange}
          setCustomRange={setCustomRange}
          t={t}
          locale={locale}
        />
      </div>

      {/* KPI strip */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        {kpis.map((c) => <StatCard key={c.label} {...c} />)}
      </div>

      {/* Trend + Status distribution */}
      <Section title={t('dashboard.trend')}>
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{t('dashboard.leadsOverTime')}</CardTitle>
            </CardHeader>
            <CardContent>
              {chartData.length === 0 ? (
                <div className="text-sm text-muted-foreground py-12 text-center">{t('dashboard.noData')}</div>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="gTotal" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#2383E2" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#2383E2" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="gHandled" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="gLost" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#ef4444" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="#ef4444" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} width={28} />
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'hsl(var(--popover))', color: 'hsl(var(--popover-foreground))' }}
                    />
                    <Area type="monotone" dataKey="total" name={t('leads.total')} fill="url(#gTotal)" stroke="#2383E2" strokeWidth={1.5} />
                    <Area type="monotone" dataKey="handled" name={t('leads.statusHandled')} fill="url(#gHandled)" stroke="#10b981" strokeWidth={1.5} />
                    <Area type="monotone" dataKey="lost" name={t('dashboard.lost')} fill="url(#gLost)" stroke="#ef4444" strokeWidth={1.5} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{t('dashboard.statusDistribution')}</CardTitle>
            </CardHeader>
            <CardContent>
              <DistributionList items={statusRows} total={total} valueLabel emptyLabel={t('dashboard.noData')} />
            </CardContent>
          </Card>
        </div>
      </Section>

      {/* Funnel */}
      <Section title={t('dashboard.funnel')}>
        <Card>
          <CardContent className="pt-4 pb-4">
            <FunnelStrip
              steps={[
                { label: t('leads.statusNew'), value: status.new || 0, color: STATUS_COLOR.new },
                { label: t('leads.statusSentToBranch'), value: status.sent_to_branch || 0, color: STATUS_COLOR.sent_to_branch },
                { label: t('leads.statusInProgress'), value: inProgress, color: STATUS_COLOR.in_progress },
                { label: t('leads.statusHandled'), value: handled, color: STATUS_COLOR.handled },
              ]}
              extra={[
                { label: t('leads.statusNotRelevant'), value: status.not_relevant || 0, color: STATUS_COLOR.not_relevant },
                { label: t('leads.statusNoAnswer'), value: status.no_answer || 0, color: STATUS_COLOR.no_answer },
              ]}
              t={t}
            />
          </CardContent>
        </Card>
      </Section>

      {/* Distributions */}
      <Section title={t('dashboard.distributions')}>
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">{t('dashboard.bySource')}</CardTitle></CardHeader>
            <CardContent><DistributionList items={sourceItems} total={total} valueLabel emptyLabel={t('dashboard.noData')} /></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">{t('dashboard.byBranch')}</CardTitle></CardHeader>
            <CardContent><DistributionList items={branchItems} total={total} valueLabel emptyLabel={t('dashboard.noData')} /></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">{t('dashboard.byType')}</CardTitle></CardHeader>
            <CardContent><DistributionList items={typeItems} total={total} valueLabel emptyLabel={t('dashboard.noData')} /></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">{t('dashboard.byCompany')}</CardTitle></CardHeader>
            <CardContent><DistributionList items={companyItems} total={total} valueLabel emptyLabel={t('dashboard.noData')} /></CardContent>
          </Card>
        </div>
      </Section>

      {/* Operational health */}
      <Section title={t('dashboard.health')}>
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {/* Dispatch */}
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm flex items-center gap-2"><Send size={14} /> {t('dashboard.dispatchHealth')}</CardTitle>
              <Badge variant={dispatchOk ? 'default' : 'secondary'} className={dispatchOk ? 'bg-emerald-500/10 text-emerald-600 border-0' : 'bg-amber-500/10 text-amber-600 border-0'}>
                {dispatchOk ? t('dashboard.ok') : t('dashboard.attention')}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-2">
              <HealthRow label={t('dashboard.branchesActive')} value={`${dispatch.dispatch_enabled} / ${dispatch.branches}`} />
              <HealthRow label={t('dashboard.missingWhatsapp')} value={dispatch.missing_whatsapp} warn={dispatch.missing_whatsapp > 0} />
              <HealthRow label={t('dashboard.queuedDispatch')} value={dispatch.queued} warn={dispatch.queued > 0} />
              <HealthRow label={t('dashboard.autoDispatch')} value={dispatchConfig?.auto_dispatch ? t('common.active') : t('common.inactive')} />
              <Link to="/branches" className="text-xs text-primary inline-flex items-center gap-1 mt-1">
                {t('dashboard.manageBranches')} <ChevronRight size={12} className="icon-directional" />
              </Link>
            </CardContent>
          </Card>

          {/* Sessions IA */}
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm flex items-center gap-2"><Sparkles size={14} /> {t('dashboard.aiHealth')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <HealthRow label={t('sessions.totalSessions')} value={sessionStats.total ?? 0} />
              <HealthRow label={t('sessions.resolved')} value={`${sessionStats.resolved ?? 0} (${sessionStats.resolution_rate ?? 0}%)`} />
              <HealthRow label={t('sessions.escalated')} value={sessionStats.escalated ?? 0} warn={(sessionStats.escalated ?? 0) > 0} />
              <HealthRow label={t('sessions.avgFirstResponse')} value={formatDuration(sessionStats.avg_first_response)} />
              <Link to="/sessions" className="text-xs text-primary inline-flex items-center gap-1 mt-1">
                {t('dashboard.viewSessions')} <ChevronRight size={12} className="icon-directional" />
              </Link>
            </CardContent>
          </Card>

          {/* Followup */}
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm flex items-center gap-2"><PhoneIncoming size={14} /> {t('dashboard.followupHealth')}</CardTitle>
              <Badge variant="secondary" className={followupReady ? 'bg-emerald-500/10 text-emerald-600 border-0' : 'bg-muted text-muted-foreground border-0'}>
                {followupReady ? t('dashboard.ok') : t('dashboard.notConfigured')}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-2">
              <HealthRow label={t('dashboard.todaySent')} value={followupStats?.today?.sent ?? 0} />
              <HealthRow label={t('dashboard.todayPending')} value={followupStats?.today?.pending ?? 0} warn={(followupStats?.today?.pending ?? 0) > 0} />
              <HealthRow label={t('dashboard.todayFailed')} value={followupStats?.today?.failed ?? 0} warn={(followupStats?.today?.failed ?? 0) > 0} />
              <HealthRow label={t('dashboard.pendingTotal')} value={followupStats?.pending_total ?? 0} />
              <Link to="/calls" className="text-xs text-primary inline-flex items-center gap-1 mt-1">
                {t('dashboard.viewCalls')} <ChevronRight size={12} className="icon-directional" />
              </Link>
            </CardContent>
          </Card>
        </div>
      </Section>

      {/* Top marketers */}
      {(stats?.top_marketers?.length ?? 0) > 0 && (
        <Section title={t('dashboard.topMarketers')}>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="space-y-3">
                {stats.top_marketers.map((m, idx) => {
                  const pctVal = pct(m.handled, m.count)
                  return (
                    <div key={m.user_id} className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-muted text-muted-foreground text-xs flex items-center justify-center font-medium shrink-0">
                        {idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium truncate">{m.name}</span>
                          <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                            {m.count} {t('dashboard.leads')} · {m.handled} {t('leads.statusHandled').toLowerCase()}{pctVal != null ? ` (${pctVal}%)` : ''}
                          </span>
                        </div>
                        <div className="h-1 bg-muted/50 rounded-full overflow-hidden mt-1">
                          <div
                            className="h-full bg-primary rounded-full"
                            style={{ width: `${Math.max(2, Math.round((m.count / stats.top_marketers[0].count) * 100))}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </Section>
      )}

      {/* Recent leads */}
      {recentLeads.length > 0 && (
        <Section
          title={t('dashboard.recentLeads')}
          action={<Link to="/leads" className="text-xs text-primary inline-flex items-center gap-1">{t('dashboard.viewAll')} <ChevronRight size={12} className="icon-directional" /></Link>}
        >
          <Card>
            <div className="divide-y">
              {recentLeads.map((l) => (
                <Link
                  key={l.id}
                  to={`/leads?id=${l.id}`}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/40 transition-colors"
                >
                  <Badge
                    className="border-0 shrink-0 capitalize"
                    style={{ background: `${STATUS_COLOR[l.status] || '#6b7280'}1a`, color: STATUS_COLOR[l.status] || '#6b7280' }}
                  >
                    {t(`leads.status_${l.status}`) || l.status}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{l.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {[l.phone, l.city, l.branch].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground tabular-nums shrink-0">
                    {new Date(l.created_at).toLocaleDateString(dateLocale)}
                  </div>
                </Link>
              ))}
            </div>
          </Card>
        </Section>
      )}

      {/* Time-to-handle (footer KPI) */}
      {stats?.avg_time_to_handle_seconds != null && (
        <div className="mt-6 text-xs text-muted-foreground">
          {t('dashboard.avgTimeToHandle')}: <span className="text-foreground font-medium">{formatDuration(stats.avg_time_to_handle_seconds)}</span>
        </div>
      )}
    </>
  )
}

function HealthRow({ label, value, warn }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-medium tabular-nums ${warn ? 'text-amber-600' : ''}`}>{value}</span>
    </div>
  )
}

function FunnelStrip({ steps, extra, t }) {
  const max = Math.max(...steps.map(s => s.value), 1)
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-3">
        {steps.map((step, idx) => {
          const w = Math.max(8, Math.round((step.value / max) * 100))
          const dropPct = idx > 0 && steps[idx - 1].value > 0
            ? Math.round((step.value / steps[idx - 1].value) * 100)
            : null
          return (
            <div key={step.label} className="relative">
              <div className="text-xs text-muted-foreground mb-1 truncate">{step.label}</div>
              <div className="text-2xl font-semibold tracking-tight" style={{ color: step.color }}>{step.value}</div>
              <div className="h-1.5 mt-1 rounded-full bg-muted/40 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${w}%`, background: step.color }} />
              </div>
              {dropPct != null && (
                <div className="text-[10px] text-muted-foreground mt-0.5">{dropPct}% {t('dashboard.fromPrevious')}</div>
              )}
            </div>
          )
        })}
      </div>
      <div className="flex flex-wrap gap-2 pt-2 border-t">
        <span className="text-xs text-muted-foreground">{t('dashboard.lostBranches')}:</span>
        {extra.map((e) => (
          <Badge key={e.label} variant="secondary" className="border-0" style={{ background: `${e.color}1a`, color: e.color }}>
            {e.label}: {e.value}
          </Badge>
        ))}
      </div>
    </div>
  )
}

// ─── Marketer ─────────────────────────────────────────

function MarketerView({ user, t, dateLocale }) {
  const [filterDateRange, setFilterDateRange] = useState('last30')
  const [customRange, setCustomRange] = useState({ from: undefined, to: undefined })
  const [copied, setCopied] = useState(false)
  const { dateFrom, dateTo } = useDateRange(filterDateRange, customRange)

  const { data: stats } = useLeadsStats({ date_from: dateFrom, date_to: dateTo })
  const { data: recentData } = useLeads({ page: 0, page_size: 10, date_from: dateFrom, date_to: dateTo })

  const status = stats?.status || {}
  const total = stats?.total || 0
  const handled = status.handled || 0
  const conversion = pct(handled, total)

  const copyLink = () => {
    if (!user?.capture_token) return
    navigator.clipboard.writeText(`${window.location.origin}/lead/${user.capture_token}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          {user?.capture_token && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={copyLink}>
              {copied ? <Check size={14} className="text-emerald-500" /> : <Link2 size={14} />}
              {copied ? t('leads.linkCopied') : t('leads.captureLink')}
            </Button>
          )}
        </div>
        <DateRangeFilter value={filterDateRange} onChange={setFilterDateRange} customRange={customRange} setCustomRange={setCustomRange} t={t} />
      </div>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <StatCard label={t('dashboard.myLeads')} value={total} icon={Users} color="#2383E2" />
        <StatCard label={t('leads.statusNew')} value={status.new || 0} icon={CircleDot} color={STATUS_COLOR.new} />
        <StatCard label={t('leads.statusHandled')} value={handled} icon={CheckCircle} color={STATUS_COLOR.handled} />
        <StatCard label={t('dashboard.kpiConversion')} value={conversion != null ? `${conversion}%` : '—'} icon={TrendingUp} color="#10b981" />
      </div>

      <Section title={t('dashboard.statusDistribution')}>
        <Card>
          <CardContent className="pt-4 pb-4">
            <DistributionList
              items={['new', 'sent_to_branch', 'in_progress', 'handled', 'not_relevant', 'no_answer']
                .filter(s => status[s])
                .map(s => ({ key: s, label: t(`leads.status_${s}`), value: status[s], color: STATUS_COLOR[s] }))}
              total={total}
              valueLabel
              emptyLabel={t('dashboard.noData')}
            />
          </CardContent>
        </Card>
      </Section>

      {(recentData?.leads?.length ?? 0) > 0 && (
        <Section
          title={t('dashboard.recentLeads')}
          action={<Link to="/leads" className="text-xs text-primary inline-flex items-center gap-1">{t('dashboard.viewAll')} <ChevronRight size={12} className="icon-directional" /></Link>}
        >
          <Card>
            <div className="divide-y">
              {recentData.leads.map((l) => (
                <Link key={l.id} to={`/leads?id=${l.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/40">
                  <Badge className="border-0 shrink-0" style={{ background: `${STATUS_COLOR[l.status] || '#6b7280'}1a`, color: STATUS_COLOR[l.status] || '#6b7280' }}>
                    {t(`leads.status_${l.status}`) || l.status}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{l.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{[l.phone, l.city].filter(Boolean).join(' · ')}</div>
                  </div>
                  <div className="text-xs text-muted-foreground tabular-nums shrink-0">{new Date(l.created_at).toLocaleDateString(dateLocale)}</div>
                </Link>
              ))}
            </div>
          </Card>
        </Section>
      )}
    </>
  )
}

// ─── Branch ───────────────────────────────────────────

function BranchView({ t, dateLocale }) {
  const [filterDateRange, setFilterDateRange] = useState('last30')
  const [customRange, setCustomRange] = useState({ from: undefined, to: undefined })
  const { dateFrom, dateTo } = useDateRange(filterDateRange, customRange)

  const { data: stats } = useLeadsStats({ date_from: dateFrom, date_to: dateTo })
  const { data: branches = [] } = useBranches()
  const { data: actionableData } = useLeads({ status: 'sent_to_branch', page: 0, page_size: 10, date_from: dateFrom, date_to: dateTo })

  const status = stats?.status || {}
  const total = stats?.total || 0
  const handled = status.handled || 0
  const pendingAction = (status.sent_to_branch || 0) + (status.in_progress || 0)
  const conversion = pct(handled, total)

  return (
    <>
      <div className="flex justify-end mb-4">
        <DateRangeFilter value={filterDateRange} onChange={setFilterDateRange} customRange={customRange} setCustomRange={setCustomRange} t={t} />
      </div>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <StatCard label={t('dashboard.myBranches')} value={branches.length} icon={Building2} color="#f97316" />
        <StatCard label={t('dashboard.kpiNewLeads')} value={status.new || 0} icon={CircleDot} color={STATUS_COLOR.new} />
        <StatCard label={t('dashboard.pendingAction')} value={pendingAction} icon={Hourglass} color={STATUS_COLOR.in_progress} />
        <StatCard label={t('dashboard.kpiConversion')} value={conversion != null ? `${conversion}%` : '—'} icon={TrendingUp} color="#10b981" />
      </div>

      <Section title={t('dashboard.byBranch')}>
        <Card>
          <CardContent className="pt-4 pb-4">
            <DistributionList
              items={(stats?.by_branch || []).map(b => ({ key: b.branch, label: `${b.branch} · ${b.handled}/${b.count} ${t('leads.statusHandled').toLowerCase()}`, value: b.count, color: '#f97316' }))}
              total={total}
              emptyLabel={t('dashboard.noData')}
            />
          </CardContent>
        </Card>
      </Section>

      {(actionableData?.leads?.length ?? 0) > 0 && (
        <Section
          title={t('dashboard.actionableLeads')}
          action={<Link to="/leads?status=sent_to_branch" className="text-xs text-primary inline-flex items-center gap-1">{t('dashboard.viewAll')} <ChevronRight size={12} className="icon-directional" /></Link>}
        >
          <Card>
            <div className="divide-y">
              {actionableData.leads.map((l) => (
                <Link key={l.id} to={`/leads?id=${l.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/40">
                  <Badge className="border-0 shrink-0" style={{ background: `${STATUS_COLOR[l.status] || '#6b7280'}1a`, color: STATUS_COLOR[l.status] || '#6b7280' }}>
                    {t(`leads.status_${l.status}`) || l.status}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{l.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{[l.phone, l.city, l.branch].filter(Boolean).join(' · ')}</div>
                  </div>
                  <div className="text-xs text-muted-foreground tabular-nums shrink-0">{new Date(l.created_at).toLocaleDateString(dateLocale)}</div>
                </Link>
              ))}
            </div>
          </Card>
        </Section>
      )}
    </>
  )
}

// ─── Page ─────────────────────────────────────────────

export default function Dashboard() {
  const { user } = useAuth()
  const { t, locale, dateLocale } = useI18n()
  usePageTitle(t('dashboard.title'))

  return (
    <div>
      <div className="mb-6">
        <p className="text-sm text-muted-foreground">
          {t('dashboard.welcome', { name: user?.first_name || user?.email })}
        </p>
      </div>

      {user?.role === 'super_admin' && <SuperAdminView t={t} />}
      {user?.role === 'admin' && <AdminView t={t} locale={locale} dateLocale={dateLocale} />}
      {user?.role === 'marketeur' && <MarketerView user={user} t={t} dateLocale={dateLocale} />}
      {user?.role === 'branch' && <BranchView t={t} dateLocale={dateLocale} />}

      {!['super_admin', 'admin', 'marketeur', 'branch'].includes(user?.role) && (
        <div className="text-sm text-muted-foreground py-8 text-center">{t('dashboard.noAccess')}</div>
      )}
    </div>
  )
}
