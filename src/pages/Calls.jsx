import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useCalls, useCallMetadata, useCallSync, useCallSyncStatus, useAgents, useFollowupConfig, useUpdateFollowupConfig, useConnectFollowupWhatsApp, useFollowupSources, useFollowupQueue, useFollowupStats } from '../hooks/queries'
import { useI18n } from '../lib/i18n'
import { usePageTitle, usePageHeader } from '../lib/page-header'
import { useSidePanel } from '../lib/side-panel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { startOfDay, startOfWeek, subDays, startOfMonth, format } from 'date-fns'
import { fr as frLocale } from 'date-fns/locale/fr'
import { enUS } from 'date-fns/locale/en-US'
import { he as heLocale } from 'date-fns/locale/he'
import { Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, Search, CalendarDays, ChevronLeft, ChevronRight, X, Play, Download, Clock, Timer, RefreshCw, Loader2, UserCheck, MessageCircle, Bot, CheckCircle, Send, XCircle, SkipForward, Activity, AlertTriangle } from 'lucide-react'

const calendarLocales = { fr: frLocale, en: enUS, he: heLocale }

const CALL_STATUS_CONFIG = {
  ANSWERED: { color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', icon: PhoneIncoming },
  NO_ANSWER: { color: 'bg-red-500/10 text-red-600 dark:text-red-400', icon: PhoneMissed },
  BUSY: { color: 'bg-orange-500/10 text-orange-600 dark:text-orange-400', icon: Phone },
  FAILED: { color: 'bg-gray-500/10 text-gray-500', icon: PhoneMissed },
}

function getCallStatusConfig(status) {
  if (!status) return CALL_STATUS_CONFIG.ANSWERED
  const upper = String(status).toUpperCase()
  if (upper.includes('ANSWER') && !upper.includes('NO')) return CALL_STATUS_CONFIG.ANSWERED
  if (upper.includes('NO') || upper.includes('MISS')) return CALL_STATUS_CONFIG.NO_ANSWER
  if (upper.includes('BUSY')) return CALL_STATUS_CONFIG.BUSY
  if (upper.includes('FAIL') || upper.includes('CANCEL')) return CALL_STATUS_CONFIG.FAILED
  return CALL_STATUS_CONFIG.ANSWERED
}

function formatDuration(seconds) {
  const s = Number(seconds) || 0
  if (s === 0) return '-'
  const m = Math.floor(s / 60)
  const sec = s % 60
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`
}

function formatDateTime(dt) {
  if (!dt) return '-'
  try {
    // Timestamps are stored as proper UTC — display in Israel timezone
    return new Date(dt).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch {
    return dt
  }
}

export default function Calls() {
  const { t, locale } = useI18n()
  usePageTitle(t('calls.title'))
  const { actionsContainer } = usePageHeader()

  // Filters
  const [filterSearch, setFilterSearch] = useState('')
  const [filterDateRange, setFilterDateRange] = useState('last30')
  const [customRange, setCustomRange] = useState({ from: undefined, to: undefined })
  const [datePopoverOpen, setDatePopoverOpen] = useState(false)

  // Pagination
  const [pageSize, setPageSize] = useState(50)
  const [currentPage, setCurrentPage] = useState(0)

  // Sync
  const callSync = useCallSync()
  const { data: syncStatus } = useCallSyncStatus()

  // Side panel
  const [selectedCall, setSelectedCall] = useState(null)
  const { panelContainer } = useSidePanel(!!selectedCall)

  // Date range computation
  const { dateFrom, dateTo } = useMemo(() => {
    const now = new Date()
    switch (filterDateRange) {
      case 'today': return { dateFrom: startOfDay(now).toISOString(), dateTo: now.toISOString() }
      case 'thisWeek': return { dateFrom: startOfWeek(now, { weekStartsOn: 1 }).toISOString(), dateTo: now.toISOString() }
      case 'last30': return { dateFrom: subDays(now, 30).toISOString(), dateTo: now.toISOString() }
      case 'thisMonth': return { dateFrom: startOfMonth(now).toISOString(), dateTo: now.toISOString() }
      case 'all': return { dateFrom: undefined, dateTo: undefined }
      case 'custom': return {
        dateFrom: customRange.from ? startOfDay(customRange.from).toISOString() : undefined,
        dateTo: customRange.to ? new Date(new Date(customRange.to).setHours(23, 59, 59, 999)).toISOString() : undefined,
      }
      default: return { dateFrom: undefined, dateTo: undefined }
    }
  }, [filterDateRange, customRange])

  const dateRangeLabel = {
    today: t('sessions.today'),
    thisWeek: t('sessions.thisWeek'),
    last30: t('sessions.last30'),
    thisMonth: t('sessions.thisMonth'),
    all: t('leads.allTime'),
    custom: customRange.from
      ? `${format(customRange.from, 'dd/MM/yyyy')}${customRange.to ? ` – ${format(customRange.to, 'dd/MM/yyyy')}` : ''}`
      : t('sessions.custom'),
  }[filterDateRange]

  const selectDatePreset = (preset) => {
    setFilterDateRange(preset)
    if (preset !== 'custom') setDatePopoverOpen(false)
  }

  // Data
  const filters = {
    search: filterSearch || undefined,
    date_from: dateFrom,
    date_to: dateTo,
    page: currentPage,
    page_size: pageSize,
  }
  const { data: callsData, isLoading, error } = useCalls(filters)

  const calls = callsData?.calls || []
  const totalFiltered = callsData?.total ?? calls.length
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize))

  useEffect(() => { setCurrentPage(0) }, [filterSearch, dateFrom, dateTo, pageSize])

  // Stats
  const stats = useMemo(() => {
    const total = totalFiltered
    const answered = calls.filter(c => {
      const s = String(c.call_status || '').toUpperCase()
      return s.includes('ANSWER') && !s.includes('NO')
    }).length
    const missed = calls.filter(c => {
      const s = String(c.call_status || '').toUpperCase()
      return s.includes('NO') || s.includes('MISS')
    }).length
    const avgDuration = calls.length > 0
      ? Math.round(calls.reduce((sum, c) => sum + (Number(c.call_duration) || 0), 0) / calls.length)
      : 0
    return { total, answered, missed, avgDuration }
  }, [calls, totalFiltered])

  const statCards = [
    { labelKey: 'calls.total', value: stats.total, icon: Phone, color: '#2383E2' },
    { labelKey: 'calls.answered', value: stats.answered, icon: PhoneIncoming, color: '#10b981' },
    { labelKey: 'calls.missed', value: stats.missed, icon: PhoneMissed, color: '#ef4444' },
    { labelKey: 'calls.avgDuration', value: formatDuration(stats.avgDuration), icon: Timer, color: '#f97316' },
  ]

  // Handlers
  const openCallPanel = (call) => setSelectedCall(call)
  const closePanel = () => setSelectedCall(null)

  // Escape to close
  useEffect(() => {
    if (!selectedCall) return
    const handleEscape = (e) => { if (e.key === 'Escape') closePanel() }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [selectedCall])

  return (
    <div>
      <Tabs defaultValue="calls">
        <TabsList className="mb-4">
          <TabsTrigger value="calls" className="gap-1.5">
            <Phone size={14} />
            {t('calls.callsTab')}
          </TabsTrigger>
          <TabsTrigger value="followup" className="gap-1.5">
            <MessageCircle size={14} />
            {t('calls.followupTab')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="calls">
          {/* Filters */}
          <div className="flex gap-3 mb-4 flex-wrap items-center">
            <div className="relative mr-auto">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8 w-[220px] h-9"
                placeholder={t('calls.search')}
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
              />
            </div>

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
                    {['today', 'thisWeek', 'last30', 'thisMonth', 'all', 'custom'].map((preset) => (
                      <button
                        key={preset}
                        onClick={() => selectDatePreset(preset)}
                        className={`text-left text-sm px-3 py-1.5 rounded-md transition-colors hover:bg-accent ${filterDateRange === preset ? 'bg-accent font-medium' : ''}`}
                      >
                        {preset === 'all' ? t('leads.allTime') : t(`sessions.${preset}`)}
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

          {error && (
            <div className="p-3 mb-4 text-sm rounded-md bg-destructive/10 text-destructive border border-destructive/20">
              {error.message || t('calls.error')}
            </div>
          )}

          {/* Stat cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {statCards.map((card) => {
              const Icon = card.icon
              return (
                <Card key={card.labelKey} className="hover:shadow-soft-md transition-all">
                  <CardHeader className="flex flex-row items-start justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground leading-tight">{t(card.labelKey)}</CardTitle>
                    <Icon size={16} className="shrink-0 mt-0.5 text-muted-foreground" style={{ color: card.color }} />
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-semibold tracking-tight">{card.value ?? 0}</div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {/* Table */}
          <Card>
            <Table className="[&_th:first-child]:pl-3 [&_td:first-child]:pl-3">
              <TableHeader>
                <TableRow>
                  <TableHead>{t('calls.caller')}</TableHead>
                  <TableHead>Lead</TableHead>
                  <TableHead>{t('calls.maskyooNumber')}</TableHead>
                  <TableHead>{t('calls.destination')}</TableHead>
                  <TableHead>{t('calls.userName')}</TableHead>
                  <TableHead>{t('common.status')}</TableHead>
                  <TableHead>{t('calls.duration')}</TableHead>
                  <TableHead>{t('common.date')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">{t('common.loading')}</TableCell></TableRow>
                ) : calls.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">{t('calls.empty')}</TableCell></TableRow>
                ) : calls.map((call, idx) => {
                  const sc = getCallStatusConfig(call.call_status)
                  const Icon = sc.icon
                  return (
                    <TableRow
                      key={call.id || call.cdr_uniqueid || idx}
                      className={`cursor-pointer ${selectedCall?.cdr_uniqueid === call.cdr_uniqueid ? 'bg-primary/5' : ''}`}
                      onClick={() => openCallPanel(call)}
                    >
                      <TableCell className="font-medium">{call.cdr_ani || '-'}</TableCell>
                      <TableCell>
                        {call.lead_name ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                            <UserCheck size={12} />
                            {call.lead_name}
                          </span>
                        ) : <span className="text-muted-foreground text-xs">-</span>}
                      </TableCell>
                      <TableCell>{call.cdr_ddi || '-'}</TableCell>
                      <TableCell>{call.user_phone || '-'}</TableCell>
                      <TableCell>{call.user_name || '-'}</TableCell>
                      <TableCell>
                        <Badge className={`${sc.color} border-0 gap-1`}>
                          <Icon size={12} />
                          {call.call_status || '-'}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatDuration(call.call_duration)}</TableCell>
                      <TableCell className="text-muted-foreground">{formatDateTime(call.start_call)}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            {totalFiltered > 0 && (
              <div className="flex items-center justify-between px-4 py-3 border-t">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>{t('sessions.rowsPerPage')}</span>
                  <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                    <SelectTrigger className="w-[70px] h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="25">25</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>{currentPage * pageSize + 1}–{Math.min((currentPage + 1) * pageSize, totalFiltered)} / {totalFiltered}</span>
                  <Button variant="ghost" size="icon" className="h-8 w-8" disabled={currentPage === 0} onClick={() => setCurrentPage(currentPage - 1)}>
                    <ChevronLeft size={14} />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" disabled={currentPage >= totalPages - 1} onClick={() => setCurrentPage(currentPage + 1)}>
                    <ChevronRight size={14} />
                  </Button>
                </div>
              </div>
            )}
          </Card>

          {/* Side panel — Call detail */}
          {panelContainer && selectedCall && createPortal(
            <CallDetailPanel call={selectedCall} onClose={closePanel} t={t} />,
            panelContainer
          )}
        </TabsContent>

        <TabsContent value="followup">
          <FollowupConfigTab t={t} />
        </TabsContent>
      </Tabs>

      {/* Header actions — Sync button */}
      {actionsContainer && createPortal(
        <div className="flex items-center gap-3">
          {syncStatus?.last_synced && (
            <span className="text-xs text-muted-foreground">
              {t('calls.lastSync')}: {new Date(syncStatus.last_synced).toLocaleString()}
            </span>
          )}
          <Button
            onClick={() => callSync.mutate({ days: 30 })}
            disabled={callSync.isPending}
            variant="outline"
            className="gap-2"
          >
            {callSync.isPending
              ? <><Loader2 size={16} className="animate-spin" />{t('calls.syncing')}</>
              : <><RefreshCw size={16} />{t('calls.sync')}</>
            }
          </Button>
        </div>,
        actionsContainer
      )}
    </div>
  )
}

// ─── Recording Player (fetch blob via auth'd proxy) ─────
function RecordingPlayer({ uuid, t }) {
  const [blobUrl, setBlobUrl] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!uuid) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setBlobUrl(null)

    const token = localStorage.getItem('token')
    fetch(`/api/calls/${encodeURIComponent(uuid)}/recording`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (cancelled) return
        const ct = res.headers.get('content-type') || ''
        if (!res.ok || ct.includes('json')) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || 'Recording not available')
        }
        return res.blob()
      })
      .then((blob) => {
        if (cancelled || !blob) return
        setBlobUrl(URL.createObjectURL(blob))
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
      setBlobUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null })
    }
  }, [uuid])

  if (loading) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={14} className="animate-spin" />{t('common.loading')}</div>
  if (error) return <div className="text-sm text-muted-foreground">{error}</div>
  if (!blobUrl) return null

  return (
    <div className="flex items-center gap-2">
      <audio controls src={blobUrl} className="w-full h-8" preload="auto" />
      <a href={blobUrl} download={`${uuid}.mp3`} className="shrink-0">
        <Button variant="ghost" size="icon" className="h-8 w-8"><Download size={14} /></Button>
      </a>
    </div>
  )
}

// ─── Follow-up Config Tab ────────────────────────────────
function FollowupConfigTab({ t }) {
  const { data: config, isLoading, refetch } = useFollowupConfig()
  const { data: agents } = useAgents()
  const { data: availableSources } = useFollowupSources()
  const { data: queue } = useFollowupQueue()
  const { data: stats } = useFollowupStats()
  const updateConfig = useUpdateFollowupConfig()
  const connectWhatsApp = useConnectFollowupWhatsApp()
  const [saving, setSaving] = useState(false)

  // Detect callback from Unipile QR scan popup
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('followup') === 'connected') {
      // Remove param from URL without reload
      params.delete('followup')
      const newUrl = window.location.pathname + (params.toString() ? '?' + params.toString() : '')
      window.history.replaceState({}, '', newUrl)
      // Force refetch config
      refetch()
    }
  }, [refetch])

  const [isActive, setIsActive] = useState(false)
  const [agentBotId, setAgentBotId] = useState(null)
  const [delayMinutes, setDelayMinutes] = useState(3)
  const [messageTemplate, setMessageTemplate] = useState('')
  const [selectedSources, setSelectedSources] = useState([])

  useEffect(() => {
    if (config) {
      setIsActive(config.is_active || false)
      setAgentBotId(config.agent_bot_id || null)
      setDelayMinutes(config.delay_minutes ?? 3)
      setMessageTemplate(config.message_template || '')
      setSelectedSources(config.sources || [])
    }
  }, [config])

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateConfig.mutateAsync({
        is_active: isActive,
        agent_bot_id: agentBotId,
        delay_minutes: delayMinutes,
        message_template: messageTemplate,
        sources: selectedSources,
      })
    } catch (err) {
      console.error(err)
    }
    setSaving(false)
  }

  const handleConnectWhatsApp = async () => {
    try {
      const data = await connectWhatsApp.mutateAsync()
      if (data.url) {
        const w = 480, h = 720
        const left = window.screenX + Math.round((window.outerWidth - w) / 2)
        const top = window.screenY + Math.round((window.outerHeight - h) / 2)
        window.open(data.url, 'followup-whatsapp-auth', `width=${w},height=${h},left=${left},top=${top}`)
      }
    } catch (err) {
      console.error(err)
    }
  }

  const toggleSource = (src) => {
    setSelectedSources(prev => {
      const exists = prev.some(s => s.user_name === src.user_name && s.cdr_ddi === src.cdr_ddi)
      if (exists) return prev.filter(s => !(s.user_name === src.user_name && s.cdr_ddi === src.cdr_ddi))
      return [...prev, src]
    })
  }

  const isSourceSelected = (src) => {
    return selectedSources.some(s => s.user_name === src.user_name && s.cdr_ddi === src.cdr_ddi)
  }

  const QUEUE_STATUS_CONFIG = {
    pending: { color: 'bg-amber-500/10 text-amber-600', icon: Clock },
    sent: { color: 'bg-emerald-500/10 text-emerald-600', icon: Send },
    skipped: { color: 'bg-gray-500/10 text-gray-500', icon: SkipForward },
    failed: { color: 'bg-red-500/10 text-red-600', icon: XCircle },
  }

  if (isLoading) return <div className="text-muted-foreground py-6 text-center">{t('common.loading')}</div>

  const isSystemActive = config?.is_active && config?.whatsapp_connected && selectedSources.length > 0

  return (
    <div className="space-y-6">
      {/* Status Indicator */}
      {config && (
        <Card className={isSystemActive
          ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20'
          : 'border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20'
        }>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                {isSystemActive ? (
                  <>
                    <div className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                    </div>
                    <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">{t('followup.statusActive')}</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle size={14} className="text-amber-500" />
                    <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">{t('followup.statusInactive')}</span>
                  </>
                )}
              </div>
              {stats?.last_sent_at && (
                <span className="text-xs text-muted-foreground">
                  {t('followup.lastSent')}: {new Date(stats.last_sent_at).toLocaleString()}
                </span>
              )}
            </div>
            <div className="grid grid-cols-4 gap-3">
              <div className="text-center">
                <div className="text-2xl font-bold text-emerald-600">{stats?.today?.sent ?? 0}</div>
                <div className="text-xs text-muted-foreground">{t('followup.sentToday')}</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-amber-600">{stats?.pending_total ?? 0}</div>
                <div className="text-xs text-muted-foreground">{t('followup.pending')}</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-500">{stats?.today?.skipped ?? 0}</div>
                <div className="text-xs text-muted-foreground">{t('followup.skipped')}</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-500">{stats?.today?.failed ?? 0}</div>
                <div className="text-xs text-muted-foreground">{t('followup.failed')}</div>
              </div>
            </div>
            {!isSystemActive && (
              <div className="mt-3 text-xs text-amber-600 dark:text-amber-400">
                {!config?.whatsapp_connected && t('followup.needWhatsApp')}
                {config?.whatsapp_connected && !config?.is_active && t('followup.needActivate')}
                {config?.whatsapp_connected && config?.is_active && selectedSources.length === 0 && t('followup.needSources')}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Section 1: WhatsApp Connection */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-500 shrink-0">
                <MessageCircle size={18} />
              </div>
              <div>
                <h3 className="text-sm font-semibold">{t('followup.whatsapp')}</h3>
                {config?.whatsapp_connected ? (
                  <p className="text-xs text-muted-foreground">{t('followup.connected')}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">{t('followup.noWhatsApp')}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {config?.whatsapp_connected && (
                <Badge variant="outline" className="gap-1 text-emerald-600 border-emerald-200 bg-emerald-50">
                  <CheckCircle size={12} />
                  {t('followup.connected')}
                </Badge>
              )}
              <Button size="sm" variant={config?.whatsapp_connected ? 'outline' : 'default'} onClick={handleConnectWhatsApp} disabled={connectWhatsApp.isPending}>
                {connectWhatsApp.isPending ? <Loader2 size={14} className="animate-spin" /> : <MessageCircle size={14} />}
                <span className="ms-1.5">{config?.whatsapp_connected ? t('followup.reconnect') : t('followup.connectWhatsApp')}</span>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section 2: Agent Selection */}
      <Card>
        <CardContent className="pt-4 pb-4 space-y-3">
          <div>
            <h3 className="text-sm font-semibold">{t('followup.agent')}</h3>
            <p className="text-xs text-muted-foreground">{t('followup.agentDesc')}</p>
          </div>
          <Select value={agentBotId ? String(agentBotId) : 'none'} onValueChange={(v) => setAgentBotId(v === 'none' ? null : parseInt(v))}>
            <SelectTrigger className="w-full h-9">
              <SelectValue placeholder={t('followup.selectAgent')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t('followup.noAgent')}</SelectItem>
              {(agents || []).map(a => (
                <SelectItem key={a.id} value={String(a.id)}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Section 3: Sources Selection */}
      <Card>
        <CardContent className="pt-4 pb-4 space-y-3">
          <div>
            <h3 className="text-sm font-semibold">{t('followup.sources')}</h3>
            <p className="text-xs text-muted-foreground">{t('followup.sourcesDesc')}</p>
          </div>
          {(!availableSources || availableSources.length === 0) ? (
            <p className="text-sm text-muted-foreground">{t('followup.noSources')}</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {availableSources.map((src, idx) => (
                <label key={idx} className="flex items-center gap-2 cursor-pointer text-sm p-2 rounded-md hover:bg-muted/50 border">
                  <Checkbox checked={isSourceSelected(src)} onCheckedChange={() => toggleSource(src)} />
                  <div className="flex flex-col">
                    <span className="font-medium">{src.user_name || '-'}</span>
                    <span className="text-xs text-muted-foreground">{src.cdr_ddi || '-'}</span>
                  </div>
                </label>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 4: Message Template */}
      <Card>
        <CardContent className="pt-4 pb-4 space-y-3">
          <div>
            <h3 className="text-sm font-semibold">{t('followup.message')}</h3>
          </div>
          <Textarea
            value={messageTemplate}
            onChange={(e) => setMessageTemplate(e.target.value)}
            placeholder={t('followup.messagePlaceholder')}
            className="min-h-[80px]"
          />
        </CardContent>
      </Card>

      {/* Section 5: Delay + Active toggle */}
      <Card>
        <CardContent className="pt-4 pb-4 space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-semibold">{t('followup.delay')}</Label>
            <p className="text-xs text-muted-foreground">{t('followup.delayDesc')}</p>
            <Input
              type="number"
              min={1}
              max={60}
              value={delayMinutes}
              onChange={(e) => setDelayMinutes(parseInt(e.target.value) || 3)}
              className="w-[120px] h-9"
            />
          </div>

          <div className="flex items-center gap-3 pt-2 border-t">
            <Switch checked={isActive} onCheckedChange={setIsActive} id="followup-active" />
            <div>
              <Label htmlFor="followup-active" className="text-sm font-medium cursor-pointer">{t('followup.active')}</Label>
              <p className="text-xs text-muted-foreground">{t('followup.activeDesc')}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 size={14} className="animate-spin me-1.5" /> : null}
          {t('common.save')}
        </Button>
      </div>

      {/* Section 6: Recent Queue */}
      {queue && queue.length > 0 && (
        <Card>
          <CardContent className="pt-4 pb-4 space-y-3">
            <h3 className="text-sm font-semibold">{t('followup.queue')}</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('calls.caller')}</TableHead>
                  <TableHead>{t('calls.userName')}</TableHead>
                  <TableHead>{t('common.status')}</TableHead>
                  <TableHead>{t('common.date')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queue.map((item) => {
                  const sc = QUEUE_STATUS_CONFIG[item.status] || QUEUE_STATUS_CONFIG.pending
                  const QIcon = sc.icon
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium text-sm">{item.phone}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{item.source_user_name || '-'}</TableCell>
                      <TableCell>
                        <Badge className={`${sc.color} border-0 gap-1`}>
                          <QIcon size={12} />
                          {t(`followup.status.${item.status}`)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDateTime(item.created_at)}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ─── Call Detail Panel ──────────────────────────────────
function CallDetailPanel({ call, onClose, t }) {
  const uuid = call.cdr_uniqueid
  const { data: metadata, isLoading: loadingMeta } = useCallMetadata(uuid)
  const sc = getCallStatusConfig(call.call_status)

  // Build a flat list of all fields from the call data
  const allFields = Object.entries(call).filter(([key]) =>
    !['id'].includes(key)
  )

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex items-center justify-between px-6 py-3 border-b shrink-0">
        <h3 className="text-sm font-semibold">{t('calls.detail')}</h3>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}><X size={14} /></Button>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {/* Status + duration cards */}
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardContent className="pt-3 pb-3">
              <div className="text-xs text-muted-foreground">{t('common.status')}</div>
              <Badge className={`${sc.color} border-0 mt-1 gap-1`}>
                <sc.icon size={12} />
                {call.call_status || '-'}
              </Badge>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-3 pb-3">
              <div className="text-xs text-muted-foreground">{t('calls.duration')}</div>
              <div className="text-sm font-semibold mt-1">{formatDuration(call.call_duration)}</div>
            </CardContent>
          </Card>
        </div>

        {/* Recording */}
        {uuid && call.call_status?.toUpperCase().includes('ANSWER') && (
          <Card>
            <CardContent className="pt-3 pb-3">
              <div className="text-xs text-muted-foreground mb-2">{t('calls.recording')}</div>
              <RecordingPlayer uuid={uuid} t={t} />
            </CardContent>
          </Card>
        )}

        {/* All fields */}
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground uppercase tracking-wider">{t('calls.allData')}</div>
          {allFields.map(([key, value]) => (
            <div key={key} className="flex items-center justify-between py-1 text-sm">
              <span className="text-muted-foreground">{key}</span>
              <span className="font-medium text-right max-w-[60%] truncate" title={String(value ?? '')}>
                {value != null ? String(value) : '-'}
              </span>
            </div>
          ))}
        </div>

        {/* Metadata */}
        {metadata && !loadingMeta && (
          <div className="space-y-2 border-t pt-3">
            <div className="text-xs text-muted-foreground uppercase tracking-wider">{t('calls.metadata')}</div>
            {Object.entries(metadata).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between py-1 text-sm">
                <span className="text-muted-foreground">{key}</span>
                <span className="font-medium text-right max-w-[60%] truncate" title={String(value ?? '')}>
                  {value != null ? String(value) : '-'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
