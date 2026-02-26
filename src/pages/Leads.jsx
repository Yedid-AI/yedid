import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useLeads, useCreateLead, useUpdateLead, useDeleteLead, useImportLeads, useDispatchLead, useBranches, useLeadFields, useCreateLeadField, useUpdateLeadField, useDeleteLeadField } from '../hooks/queries'
import { useAuth } from '../lib/auth'
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
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Textarea } from '@/components/ui/textarea'
import { startOfDay, startOfWeek, subDays, startOfMonth, format } from 'date-fns'
import { fr as frLocale } from 'date-fns/locale/fr'
import { enUS } from 'date-fns/locale/en-US'
import { he as heLocale } from 'date-fns/locale/he'
import { UserPlus, Search, CalendarDays, ChevronLeft, ChevronRight, X, Upload, CircleDot, CheckCircle, Clock, AlertTriangle, Ban, PhoneOff, Send, Settings, Plus, Trash2 } from 'lucide-react'
import babaitLogo from '@/assets/babaitlogo.png'
import aviezerLogo from '@/assets/aviezer logo.png'

const COMPANY_LOGOS = {
  babait: { src: babaitLogo, label: 'בבית' },
  aviezer: { src: aviezerLogo, label: 'אביעזר' },
}

const calendarLocales = { fr: frLocale, en: enUS, he: heLocale }

const STATUS_CONFIG = {
  new: { color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400', icon: CircleDot },
  sent_to_branch: { color: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400', icon: Clock },
  in_progress: { color: 'bg-orange-500/10 text-orange-600 dark:text-orange-400', icon: Clock },
  handled: { color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', icon: CheckCircle },
  not_relevant: { color: 'bg-gray-500/10 text-gray-500', icon: Ban },
  no_answer: { color: 'bg-red-500/10 text-red-600 dark:text-red-400', icon: PhoneOff },
}

const emptyForm = {
  company: 'babait', type: 'patient', name: '', phone: '', email: '', city: '',
  branch: '', source: '', service_requested: '', details: '', status: 'new',
  position_type: '', custom_fields: {},
}

export default function Leads() {
  const { user } = useAuth()
  const { t, locale } = useI18n()
  usePageTitle(t('leads.title'))
  const { actionsContainer } = usePageHeader()

  // Filters
  const [filterCompany, setFilterCompany] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterBranch, setFilterBranch] = useState('')
  const [filterSearch, setFilterSearch] = useState('')
  const [filterDateRange, setFilterDateRange] = useState('last30')
  const [customRange, setCustomRange] = useState({ from: undefined, to: undefined })
  const [datePopoverOpen, setDatePopoverOpen] = useState(false)

  // Pagination
  const [pageSize, setPageSize] = useState(50)
  const [currentPage, setCurrentPage] = useState(0)

  // Side panel / dialogs
  const [selectedLead, setSelectedLead] = useState(null)
  const [editMode, setEditMode] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [fieldsDialogOpen, setFieldsDialogOpen] = useState(false)
  const [error, setError] = useState('')

  const { panelContainer } = useSidePanel(!!selectedLead)

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
    company: filterCompany || undefined,
    type: filterType || undefined,
    status: filterStatus || undefined,
    branch: filterBranch || undefined,
    search: filterSearch || undefined,
    date_from: dateFrom,
    date_to: dateTo,
    page: currentPage,
    page_size: pageSize,
  }
  const { data: leadsData, isLoading } = useLeads(filters)
  const { data: branches = [] } = useBranches()
  const { data: leadFields = [] } = useLeadFields()
  const createLead = useCreateLead()
  const updateLead = useUpdateLead()
  const deleteLead = useDeleteLead()
  const importLeads = useImportLeads()
  const dispatchLead = useDispatchLead()

  const leads = leadsData?.leads || []
  const stats = leadsData?.stats || {}
  const totalFiltered = leadsData?.total ?? leads.length

  // Pagination (server-side)
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize))

  useEffect(() => { setCurrentPage(0) }, [filterCompany, filterType, filterStatus, filterBranch, filterSearch, dateFrom, dateTo, pageSize])

  // Stat cards
  const statCards = [
    { labelKey: 'leads.total', value: stats.total, icon: CircleDot, color: '#2383E2' },
    { labelKey: 'leads.statusNew', value: stats.new, icon: CircleDot, color: '#3b82f6' },
    { labelKey: 'leads.statusInProgress', value: stats.in_progress, icon: Clock, color: '#f97316' },
    { labelKey: 'leads.statusHandled', value: stats.handled, icon: CheckCircle, color: '#10b981' },
    { labelKey: 'leads.statusNotRelevant', value: stats.not_relevant, icon: Ban, color: '#6b7280' },
    { labelKey: 'leads.statusNoAnswer', value: stats.no_answer, icon: PhoneOff, color: '#ef4444' },
  ]

  // Handlers
  const handleCreate = async (e) => {
    e.preventDefault()
    setError('')
    try {
      await createLead.mutateAsync(form)
      setCreateDialogOpen(false)
      setForm(emptyForm)
    } catch (err) { setError(err.message) }
  }

  const handleUpdate = async (e) => {
    e.preventDefault()
    setError('')
    try {
      await updateLead.mutateAsync({ id: selectedLead.id, body: form })
      setEditMode(false)
      setSelectedLead({ ...selectedLead, ...form })
    } catch (err) { setError(err.message) }
  }

  const handleDelete = async (id) => {
    try {
      await deleteLead.mutateAsync(id)
      setSelectedLead(null)
    } catch (err) { setError(err.message) }
  }

  const handleDispatch = async (id) => {
    setError('')
    try {
      const result = await dispatchLead.mutateAsync(id)
      setSelectedLead((prev) => prev ? { ...prev, status: 'sent_to_branch', dispatched_at: new Date().toISOString() } : prev)
    } catch (err) { setError(err.message) }
  }

  const openLeadPanel = (lead) => {
    setSelectedLead(lead)
    setEditMode(false)
    setForm({
      company: lead.company || 'babait',
      type: lead.type || 'patient',
      name: lead.name || '',
      phone: lead.phone || '',
      email: lead.email || '',
      city: lead.city || '',
      branch: lead.branch || '',
      source: lead.source || '',
      service_requested: lead.service_requested || '',
      details: lead.details || '',
      status: lead.status || 'new',
      position_type: lead.position_type || '',
      custom_fields: lead.custom_fields || {},
    })
  }

  const closePanel = () => { setSelectedLead(null); setEditMode(false) }

  // Import
  const [importFile, setImportFile] = useState(null)
  const [importResult, setImportResult] = useState(null)
  const [importPreview, setImportPreview] = useState(null) // { headers: [], rows: [] }
  const [columnMapping, setColumnMapping] = useState({}) // { csvColumn: dbField }
  const [importCompany, setImportCompany] = useState('babait')
  const [importType, setImportType] = useState('patient')

  const MAPPABLE_FIELDS = [
    { key: '', label: '-- Skip --' },
    { key: 'name', label: t('common.name') },
    { key: 'phone', label: t('leads.phone') },
    { key: 'email', label: t('common.email') },
    { key: 'city', label: t('leads.city') },
    { key: 'branch', label: t('leads.branch') },
    { key: 'source', label: t('leads.source') },
    { key: 'service_requested', label: t('leads.serviceRequested') },
    { key: 'service_type', label: t('leads.serviceType') },
    { key: 'coordinator', label: t('leads.coordinator') },
    { key: 'position_type', label: t('leads.positionType') },
    { key: 'details', label: t('common.details') },
    { key: 'campaign', label: t('leads.campaign') },
    { key: 'lead_channel', label: t('leads.leadChannel') },
    { key: 'status', label: t('common.status') },
  ]

  const parseCSVPreview = (text) => {
    const lines = text.split('\n').filter(l => l.trim())
    if (lines.length === 0) return null
    const parseLine = (line) => {
      const result = []; let current = ''; let inQuotes = false
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (ch === '"') { inQuotes = !inQuotes }
        else if (ch === ',' && !inQuotes) { result.push(current.trim()); current = '' }
        else { current += ch }
      }
      result.push(current.trim())
      return result
    }
    const headers = parseLine(lines[0])
    const rows = lines.slice(1, 6).map(parseLine) // first 5 data rows
    return { headers, rows }
  }

  const handleFileSelect = (file) => {
    setImportFile(file)
    setImportResult(null)
    setImportPreview(null)
    setColumnMapping({})
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => {
      const preview = parseCSVPreview(e.target.result)
      if (preview) {
        setImportPreview(preview)
        // Auto-guess mapping based on common header names
        const guesses = {}
        const guessMap = {
          name: ['name', 'שם', 'nom', 'full_name', 'שם מלא', 'שם פרטי'],
          phone: ['phone', 'טלפון', 'נייד', 'telephone', 'mobile', 'tel'],
          email: ['email', 'מייל', 'mail', 'e-mail', 'דואר אלקטרוני'],
          city: ['city', 'עיר', 'ville', 'ער'],
          branch: ['branch', 'סניף', 'branche'],
          source: ['source', 'מקור', 'origine'],
          service_requested: ['service', 'שירות', 'service_requested'],
          details: ['details', 'פרטים', 'notes', 'הערות'],
          coordinator: ['coordinator', 'רכז', 'מתאם', 'coordinateur'],
          status: ['status', 'סטטוס', 'statut'],
          campaign: ['campaign', 'קמפיין', 'campagne'],
        }
        preview.headers.forEach((h) => {
          const lower = h.toLowerCase().trim()
          for (const [field, aliases] of Object.entries(guessMap)) {
            if (aliases.some(a => lower.includes(a)) && !Object.values(guesses).includes(field)) {
              guesses[h] = field
              break
            }
          }
        })
        setColumnMapping(guesses)
      }
    }
    reader.readAsText(file)
  }

  const handleImport = async (e) => {
    e.preventDefault()
    if (!importFile) return
    setError('')
    setImportResult(null)
    try {
      const fd = new FormData()
      fd.append('file', importFile)
      fd.append('company', importCompany)
      fd.append('type', importType)
      fd.append('column_mapping', JSON.stringify(columnMapping))
      const result = await importLeads.mutateAsync(fd)
      setImportResult(result)
    } catch (err) { setError(err.message) }
  }

  // Escape key to close panel
  useEffect(() => {
    if (!selectedLead) return
    const handleEscape = (e) => { if (e.key === 'Escape') closePanel() }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [selectedLead])

  // Branch names for filter dropdown (from branches query, not paginated leads)
  const branchNames = useMemo(() => branches.map(b => b.name).sort(), [branches])

  return (
    <div>
      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap items-center">
        <div className="relative mr-auto">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8 w-[220px] h-9"
            placeholder={t('leads.search')}
            value={filterSearch}
            onChange={(e) => setFilterSearch(e.target.value)}
          />
        </div>

        {user?.role === 'super_admin' && (
          <Select value={filterCompany || 'all'} onValueChange={(v) => setFilterCompany(v === 'all' ? '' : v)}>
            <SelectTrigger className="w-[140px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('leads.allCompanies')}</SelectItem>
              <SelectItem value="babait">Babait</SelectItem>
              <SelectItem value="aviezer">Aviezer</SelectItem>
            </SelectContent>
          </Select>
        )}

        <Select value={filterType || 'all'} onValueChange={(v) => setFilterType(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-[140px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('leads.allTypes')}</SelectItem>
            <SelectItem value="patient">{t('leads.typePatient')}</SelectItem>
            <SelectItem value="caregiver">{t('leads.typeCaregiver')}</SelectItem>
            <SelectItem value="foreign_caregiver">{t('leads.typeForeignCaregiver')}</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterStatus || 'all'} onValueChange={(v) => setFilterStatus(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-[140px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('sessions.allStatuses')}</SelectItem>
            <SelectItem value="new">{t('leads.statusNew')}</SelectItem>
            <SelectItem value="sent_to_branch">{t('leads.statusSentToBranch')}</SelectItem>
            <SelectItem value="in_progress">{t('leads.statusInProgress')}</SelectItem>
            <SelectItem value="handled">{t('leads.statusHandled')}</SelectItem>
            <SelectItem value="not_relevant">{t('leads.statusNotRelevant')}</SelectItem>
            <SelectItem value="no_answer">{t('leads.statusNoAnswer')}</SelectItem>
          </SelectContent>
        </Select>

        {branchNames.length > 0 && (
          <Select value={filterBranch || 'all'} onValueChange={(v) => setFilterBranch(v === 'all' ? '' : v)}>
            <SelectTrigger className="w-[140px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('leads.allBranches')}</SelectItem>
              {branchNames.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
        )}

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
        <div className="p-3 mb-4 text-sm rounded-md bg-destructive/10 text-destructive border border-destructive/20">{error}</div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
        {statCards.map((card) => {
          const Icon = card.icon
          return (
            <Card key={card.labelKey} className="hover:shadow-soft-md transition-all">
              <CardHeader className="flex flex-row items-start justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground leading-tight min-h-[2rem]">{t(card.labelKey)}</CardTitle>
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
              <TableHead>{t('common.name')}</TableHead>
              <TableHead>{t('leads.type')}</TableHead>
              <TableHead>{t('leads.phone')}</TableHead>
              <TableHead>{t('leads.city')}</TableHead>
              <TableHead>{t('leads.branch')}</TableHead>
              <TableHead>{t('leads.serviceRequested')}</TableHead>
              <TableHead>{t('common.status')}</TableHead>
              <TableHead>{t('leads.source')}</TableHead>
              {user?.role === 'super_admin' && <TableHead>{t('leads.company')}</TableHead>}
              <TableHead>{t('common.date')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-6">{t('common.loading')}</TableCell></TableRow>
            ) : leads.length === 0 ? (
              <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-6">{t('leads.empty')}</TableCell></TableRow>
            ) : leads.map((lead) => {
              const sc = STATUS_CONFIG[lead.status] || STATUS_CONFIG.new
              return (
                <TableRow key={lead.id} className={`cursor-pointer ${selectedLead?.id === lead.id ? 'bg-primary/5' : ''}`} onClick={() => openLeadPanel(lead)}>
                  <TableCell className="font-medium">{lead.name}</TableCell>
                  <TableCell>{lead.type === 'patient' ? '🧑‍🦳' : lead.type === 'caregiver' ? '👩‍⚕️' : '🌍'} {t(`leads.type_${lead.type}`)}</TableCell>
                  <TableCell>{lead.phone}</TableCell>
                  <TableCell>{lead.city || '-'}</TableCell>
                  <TableCell>{lead.branch || '-'}</TableCell>
                  <TableCell>{lead.service_requested || '-'}</TableCell>
                  <TableCell>
                    <Badge className={`${sc.color} border-0`}>{t(`leads.status_${lead.status}`)}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{lead.source || '-'}</TableCell>
                  {user?.role === 'super_admin' && <TableCell>
                    {COMPANY_LOGOS[lead.company] ? (
                      <div className="flex items-center gap-1.5">
                        <img src={COMPANY_LOGOS[lead.company].src} alt={lead.company} className="h-5 w-5 rounded-sm object-contain" />
                        <span className="text-xs font-medium">{COMPANY_LOGOS[lead.company].label}</span>
                      </div>
                    ) : <Badge variant="outline">{lead.company}</Badge>}
                  </TableCell>}
                  <TableCell className="text-muted-foreground">{new Date(lead.created_at).toLocaleDateString()}</TableCell>
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

      {/* Side panel — Lead detail/edit */}
      {panelContainer && selectedLead && createPortal(
        <div className="w-full h-full flex flex-col">
          <div className="flex items-center justify-between px-6 py-3 border-b shrink-0">
            <h3 className="text-sm font-semibold">{editMode ? t('common.edit') : t('leads.detail')}</h3>
            <div className="flex items-center gap-2">
              {editMode ? (
                <>
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setEditMode(false)}>{t('common.cancel')}</Button>
                  <Button size="sm" className="h-7 text-xs" type="submit" form="lead-edit-form">{t('common.save')}</Button>
                </>
              ) : (
                <>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive">{t('common.delete')}</Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t('leads.deleteTitle')}</AlertDialogTitle>
                        <AlertDialogDescription>{t('common.irreversible')}</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                        <AlertDialogAction variant="destructive" onClick={() => handleDelete(selectedLead.id)}>{t('common.delete')}</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  {selectedLead.branch && selectedLead.status !== 'sent_to_branch' && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm" className="h-7 text-xs gap-1" disabled={dispatchLead.isPending}>
                          <Send size={12} />
                          {t('leads.sendToBranch')}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t('leads.dispatchConfirmTitle')}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {t('leads.dispatchConfirmDesc', { name: selectedLead.name, branch: selectedLead.branch })}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDispatch(selectedLead.id)}>
                            {dispatchLead.isPending ? t('leads.dispatching') : t('leads.sendToBranch')}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setEditMode(true)}>{t('common.edit')}</Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={closePanel}><X size={14} /></Button>
                </>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {editMode ? (
              <form id="lead-edit-form" onSubmit={handleUpdate} className="space-y-4">
                <LeadFormFields form={form} setForm={setForm} t={t} branches={branches} leadFields={leadFields} showCompany={user?.role === 'super_admin'} />
              </form>
            ) : (
              <LeadDetail lead={selectedLead} t={t} leadFields={leadFields} isSuperAdmin={user?.role === 'super_admin'} />
            )}
          </div>
        </div>,
        panelContainer
      )}

      {/* Create dialog */}
      <Dialog open={createDialogOpen} onOpenChange={(open) => { setCreateDialogOpen(open); if (!open) setForm(emptyForm) }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('leads.dialogTitle')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <LeadFormFields form={form} setForm={setForm} t={t} branches={branches} leadFields={leadFields} showCompany={user?.role === 'super_admin'} />
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>{t('common.cancel')}</Button>
              <Button type="submit">{t('common.create')}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Import dialog */}
      <Dialog open={importDialogOpen} onOpenChange={(open) => { setImportDialogOpen(open); if (!open) { setImportFile(null); setImportResult(null); setImportPreview(null); setColumnMapping({}) } }}>
        <DialogContent className={importPreview ? 'max-w-2xl max-h-[85vh] overflow-y-auto' : 'max-w-md'}>
          <DialogHeader>
            <DialogTitle>{t('leads.importTitle')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleImport} className="space-y-4">
            <div className="space-y-2">
              <Label>{t('leads.csvFile')}</Label>
              <Input type="file" accept=".csv" onChange={(e) => handleFileSelect(e.target.files?.[0] || null)} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{t('leads.company')}</Label>
                <Select value={importCompany} onValueChange={setImportCompany}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="babait">Babait</SelectItem>
                    <SelectItem value="aviezer">Aviezer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('leads.type')}</Label>
                <Select value={importType} onValueChange={setImportType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="patient">{t('leads.typePatient')}</SelectItem>
                    <SelectItem value="caregiver">{t('leads.typeCaregiver')}</SelectItem>
                    <SelectItem value="foreign_caregiver">{t('leads.typeForeignCaregiver')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Column mapping */}
            {importPreview && (
              <div className="space-y-3 border-t pt-3">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">{t('leads.columnMapping')}</Label>
                <div className="space-y-2">
                  {importPreview.headers.map((header, idx) => (
                    <div key={idx} className="flex items-center gap-3">
                      <span className="text-sm text-muted-foreground w-[40%] truncate" title={header}>{header}</span>
                      <span className="text-muted-foreground">→</span>
                      <Select
                        value={columnMapping[header] || ''}
                        onValueChange={(v) => setColumnMapping({ ...columnMapping, [header]: v })}
                      >
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="-- Skip --" /></SelectTrigger>
                        <SelectContent>
                          {MAPPABLE_FIELDS.map((f) => (
                            <SelectItem key={f.key} value={f.key || 'skip'}>{f.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>

                {/* Preview table */}
                <div className="border rounded-md overflow-x-auto">
                  <Table className="text-xs">
                    <TableHeader>
                      <TableRow>
                        {importPreview.headers.map((h, i) => (
                          <TableHead key={i} className="py-1 px-2 whitespace-nowrap">{columnMapping[h] || <span className="text-muted-foreground italic">skip</span>}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {importPreview.rows.map((row, ri) => (
                        <TableRow key={ri}>
                          {row.map((cell, ci) => (
                            <TableCell key={ci} className="py-1 px-2 whitespace-nowrap max-w-[150px] truncate">{cell}</TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {importResult && (
              <div className="p-3 rounded-md bg-muted text-sm">
                <p>{t('leads.importResult', { imported: importResult.imported, skipped: importResult.skipped, total: importResult.total_rows })}</p>
                {importResult.errors?.length > 0 && (
                  <p className="text-destructive mt-1">{importResult.errors.join(', ')}</p>
                )}
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setImportDialogOpen(false)}>{t('common.cancel')}</Button>
              <Button type="submit" disabled={importLeads.isPending || !importFile}>
                {importLeads.isPending ? t('common.saving') : t('leads.import')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Fields management dialog */}
      <FieldsDialog
        open={fieldsDialogOpen}
        onOpenChange={setFieldsDialogOpen}
        leadFields={leadFields}
        t={t}
      />

      {/* Header actions */}
      {actionsContainer && createPortal(
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setFieldsDialogOpen(true)}>
            <Settings size={14} />
            {t('leads.manageFields')}
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setImportDialogOpen(true)}>
            <Upload size={14} />
            {t('leads.import')}
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => setCreateDialogOpen(true)}>
            <UserPlus size={14} />
            {t('common.new')}
          </Button>
        </div>,
        actionsContainer
      )}
    </div>
  )
}

// ─── Lead Form Fields (reusable) ────────────────────────
function LeadFormFields({ form, setForm, t, branches, leadFields, showCompany }) {
  return (
    <>
      {showCompany && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>{t('leads.company')}</Label>
            <Select value={form.company} onValueChange={(v) => setForm({ ...form, company: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="babait">Babait</SelectItem>
                <SelectItem value="aviezer">Aviezer</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t('leads.type')}</Label>
            <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="patient">{t('leads.typePatient')}</SelectItem>
                <SelectItem value="caregiver">{t('leads.typeCaregiver')}</SelectItem>
                <SelectItem value="foreign_caregiver">{t('leads.typeForeignCaregiver')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>{t('common.name')} *</Label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </div>
        <div className="space-y-2">
          <Label>{t('leads.phone')} *</Label>
          <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>{t('common.email')}</Label>
          <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>{t('leads.city')}</Label>
          <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>{t('leads.branch')}</Label>
          <Select value={form.branch || 'none'} onValueChange={(v) => setForm({ ...form, branch: v === 'none' ? '' : v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">-</SelectItem>
              {branches.map((b) => <SelectItem key={b.id} value={b.name}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>{t('leads.source')}</Label>
          <Input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} />
        </div>
      </div>
      <div className="space-y-2">
        <Label>{t('leads.serviceRequested')}</Label>
        <Input value={form.service_requested} onChange={(e) => setForm({ ...form, service_requested: e.target.value })} />
      </div>
      <div className="space-y-2">
        <Label>{t('common.status')}</Label>
        <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="new">{t('leads.statusNew')}</SelectItem>
            <SelectItem value="sent_to_branch">{t('leads.statusSentToBranch')}</SelectItem>
            <SelectItem value="in_progress">{t('leads.statusInProgress')}</SelectItem>
            <SelectItem value="handled">{t('leads.statusHandled')}</SelectItem>
            <SelectItem value="not_relevant">{t('leads.statusNotRelevant')}</SelectItem>
            <SelectItem value="no_answer">{t('leads.statusNoAnswer')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>{t('common.details')}</Label>
        <Textarea value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} rows={3} />
      </div>
      {/* Custom fields */}
      {leadFields.length > 0 && (
        <div className="space-y-3 border-t pt-3">
          <Label className="text-xs text-muted-foreground uppercase tracking-wider">{t('leads.customFields')}</Label>
          {leadFields.map((fd) => (
            <div key={fd.id} className="space-y-1.5">
              <Label className="text-xs">{fd.label}</Label>
              {fd.field_type === 'select' ? (
                <Select
                  value={form.custom_fields?.[fd.field_key] || ''}
                  onValueChange={(v) => setForm({ ...form, custom_fields: { ...form.custom_fields, [fd.field_key]: v } })}
                >
                  <SelectTrigger><SelectValue placeholder="-" /></SelectTrigger>
                  <SelectContent>
                    {(fd.options || []).map((opt) => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : fd.field_type === 'boolean' ? (
                <Select
                  value={form.custom_fields?.[fd.field_key] ?? ''}
                  onValueChange={(v) => setForm({ ...form, custom_fields: { ...form.custom_fields, [fd.field_key]: v } })}
                >
                  <SelectTrigger><SelectValue placeholder="-" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">{t('common.yes')}</SelectItem>
                    <SelectItem value="false">{t('common.no')}</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  type={fd.field_type === 'number' ? 'number' : fd.field_type === 'date' ? 'date' : 'text'}
                  value={form.custom_fields?.[fd.field_key] || ''}
                  onChange={(e) => setForm({ ...form, custom_fields: { ...form.custom_fields, [fd.field_key]: e.target.value } })}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </>
  )
}

// ─── Lead Detail (read-only) ────────────────────────────
function LeadDetail({ lead, t, leadFields, isSuperAdmin }) {
  const sc = STATUS_CONFIG[lead.status] || STATUS_CONFIG.new
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="pt-3 pb-3">
            <div className="text-xs text-muted-foreground">{t('common.status')}</div>
            <Badge className={`${sc.color} border-0 mt-1`}>{t(`leads.status_${lead.status}`)}</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-3">
            <div className="text-xs text-muted-foreground">{t('leads.type')}</div>
            <div className="text-sm font-semibold mt-1">{t(`leads.type_${lead.type}`)}</div>
          </CardContent>
        </Card>
        {isSuperAdmin && (
          <Card>
            <CardContent className="pt-3 pb-3">
              <div className="text-xs text-muted-foreground">{t('leads.company')}</div>
              {COMPANY_LOGOS[lead.company] ? (
                <div className="flex items-center gap-2 mt-1">
                  <img src={COMPANY_LOGOS[lead.company].src} alt={lead.company} className="h-6 w-6 rounded-sm object-contain" />
                  <span className="text-sm font-semibold">{COMPANY_LOGOS[lead.company].label}</span>
                </div>
              ) : <Badge variant="outline" className="mt-1">{lead.company}</Badge>}
            </CardContent>
          </Card>
        )}
        <Card>
          <CardContent className="pt-3 pb-3">
            <div className="text-xs text-muted-foreground">{t('common.date')}</div>
            <div className="text-sm font-semibold mt-1">{new Date(lead.created_at).toLocaleDateString()}</div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-2">
        <DetailRow label={t('common.name')} value={lead.name} />
        <DetailRow label={t('leads.phone')} value={lead.phone} />
        <DetailRow label={t('common.email')} value={lead.email} />
        <DetailRow label={t('leads.city')} value={lead.city} />
        <DetailRow label={t('leads.branch')} value={lead.branch} />
        <DetailRow label={t('leads.source')} value={lead.source} />
        <DetailRow label={t('leads.serviceRequested')} value={lead.service_requested} />
        {lead.service_type && <DetailRow label={t('leads.serviceType')} value={lead.service_type} />}
        {lead.coordinator && <DetailRow label={t('leads.coordinator')} value={lead.coordinator} />}
        {lead.position_type && <DetailRow label={t('leads.positionType')} value={lead.position_type} />}
        {lead.campaign && <DetailRow label={t('leads.campaign')} value={lead.campaign} />}
      </div>

      {lead.dispatched_at && (
        <Card>
          <CardContent className="pt-3 pb-3">
            <div className="text-xs text-muted-foreground mb-1">{t('leads.dispatchedAt')}</div>
            <div className="text-sm font-medium">{new Date(lead.dispatched_at).toLocaleString()}</div>
          </CardContent>
        </Card>
      )}

      {lead.details && (
        <Card>
          <CardContent className="pt-3 pb-3">
            <div className="text-xs text-muted-foreground mb-1">{t('common.details')}</div>
            <p className="text-sm whitespace-pre-wrap">{lead.details}</p>
          </CardContent>
        </Card>
      )}

      {/* Custom fields */}
      {leadFields.length > 0 && Object.keys(lead.custom_fields || {}).length > 0 && (
        <div className="space-y-2 border-t pt-3">
          <div className="text-xs text-muted-foreground uppercase tracking-wider">{t('leads.customFields')}</div>
          {leadFields.map((fd) => {
            const val = lead.custom_fields?.[fd.field_key]
            if (!val) return null
            return <DetailRow key={fd.id} label={fd.label} value={val} />
          })}
        </div>
      )}
    </div>
  )
}

// ─── Fields Management Dialog ────────────────────────────
function FieldsDialog({ open, onOpenChange, leadFields, t }) {
  const createField = useCreateLeadField()
  const updateField = useUpdateLeadField()
  const deleteField = useDeleteLeadField()

  const emptyField = { field_key: '', label: '', field_type: 'text', options: [], required: false }
  const [newField, setNewField] = useState(emptyField)
  const [optionsText, setOptionsText] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [error, setError] = useState('')

  const FIELD_TYPES = [
    { value: 'text', label: t('leads.fieldTypeText') },
    { value: 'number', label: t('leads.fieldTypeNumber') },
    { value: 'boolean', label: t('leads.fieldTypeBoolean') },
    { value: 'select', label: t('leads.fieldTypeSelect') },
    { value: 'date', label: t('leads.fieldTypeDate') },
  ]

  const resetForm = () => {
    setNewField(emptyField)
    setOptionsText('')
    setEditingId(null)
    setError('')
  }

  const startEdit = (fd) => {
    setEditingId(fd.id)
    setNewField({ field_key: fd.field_key, label: fd.label, field_type: fd.field_type, options: fd.options || [], required: fd.required || false })
    setOptionsText((fd.options || []).join(', '))
  }

  const handleSave = async () => {
    setError('')
    const key = newField.field_key.trim()
    const label = newField.label.trim()
    if (!key || !label) { setError(t('leads.fieldKeyLabelRequired')); return }

    const body = {
      field_key: key,
      label,
      field_type: newField.field_type,
      options: newField.field_type === 'select' ? optionsText.split(',').map(s => s.trim()).filter(Boolean) : null,
      required: newField.required,
    }

    try {
      if (editingId) {
        await updateField.mutateAsync({ id: editingId, body })
      } else {
        await createField.mutateAsync(body)
      }
      resetForm()
    } catch (err) { setError(err.message) }
  }

  const handleDelete = async (id) => {
    try {
      await deleteField.mutateAsync(id)
    } catch (err) { setError(err.message) }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) resetForm() }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('leads.manageFields')}</DialogTitle>
        </DialogHeader>

        {/* Existing fields */}
        {leadFields.length > 0 && (
          <div className="space-y-2">
            {leadFields.map((fd) => (
              <div key={fd.id} className={`flex items-center gap-2 p-2 rounded-md border ${editingId === fd.id ? 'border-primary bg-primary/5' : ''}`}>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{fd.label}</div>
                  <div className="text-xs text-muted-foreground">{fd.field_key} · {fd.field_type}{fd.options?.length ? ` (${fd.options.length} options)` : ''}</div>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => editingId === fd.id ? resetForm() : startEdit(fd)}>
                  <Settings size={12} />
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-destructive">
                      <Trash2 size={12} />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t('leads.deleteFieldTitle')}</AlertDialogTitle>
                      <AlertDialogDescription>{t('leads.deleteFieldDesc', { label: fd.label })}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                      <AlertDialogAction variant="destructive" onClick={() => handleDelete(fd.id)}>{t('common.delete')}</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ))}
          </div>
        )}

        {leadFields.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">{t('leads.noCustomFields')}</p>
        )}

        {/* Add / Edit form */}
        <div className="space-y-3 border-t pt-3">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {editingId ? t('leads.editField') : t('leads.addField')}
          </div>
          {error && <div className="text-sm text-destructive">{error}</div>}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">{t('leads.fieldKey')}</Label>
              <Input
                className="h-8 text-sm"
                placeholder="e.g. urgency"
                value={newField.field_key}
                onChange={(e) => setNewField({ ...newField, field_key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })}
                disabled={!!editingId}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t('leads.fieldLabel')}</Label>
              <Input
                className="h-8 text-sm"
                placeholder="e.g. Urgency"
                value={newField.label}
                onChange={(e) => setNewField({ ...newField, label: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t('leads.fieldType')}</Label>
            <Select value={newField.field_type} onValueChange={(v) => setNewField({ ...newField, field_type: v })}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {FIELD_TYPES.map((ft) => <SelectItem key={ft.value} value={ft.value}>{ft.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {newField.field_type === 'select' && (
            <div className="space-y-1">
              <Label className="text-xs">{t('leads.fieldOptions')}</Label>
              <Input
                className="h-8 text-sm"
                placeholder="low, medium, high"
                value={optionsText}
                onChange={(e) => setOptionsText(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t('leads.fieldOptionsHint')}</p>
            </div>
          )}
          <div className="flex gap-2">
            {editingId && (
              <Button variant="outline" size="sm" onClick={resetForm}>{t('common.cancel')}</Button>
            )}
            <Button size="sm" className="gap-1" onClick={handleSave} disabled={createField.isPending || updateField.isPending}>
              <Plus size={12} />
              {editingId ? t('common.save') : t('leads.addField')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function DetailRow({ label, value }) {
  if (!value) return null
  return (
    <div className="flex items-center justify-between py-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  )
}
