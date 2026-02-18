import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useCalls, useCallMetadata, useCallSync, useCallSyncStatus } from '../hooks/queries'
import { useI18n } from '../lib/i18n'
import { usePageTitle, usePageHeader } from '../lib/page-header'
import { useSidePanel } from '../lib/side-panel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { startOfDay, startOfWeek, subDays, startOfMonth, format } from 'date-fns'
import { fr as frLocale } from 'date-fns/locale/fr'
import { enUS } from 'date-fns/locale/en-US'
import { he as heLocale } from 'date-fns/locale/he'
import { Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, Search, CalendarDays, ChevronLeft, ChevronRight, X, Play, Download, Clock, Timer, RefreshCw, Loader2 } from 'lucide-react'

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
    const d = new Date(dt)
    return d.toLocaleString()
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
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">{t('common.loading')}</TableCell></TableRow>
            ) : calls.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">{t('calls.empty')}</TableCell></TableRow>
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
