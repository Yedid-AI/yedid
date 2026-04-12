import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useLeads, useCreateLead, useUpdateLead, useDeleteLead, useImportLeads, useDispatchLead, useBranches, useLeadFields, useCreateLeadField, useUpdateLeadField, useDeleteLeadField, useLeadCalls, useLeadActivities, useAddLeadComment, useLeadDocuments, useUploadLeadDocument, useDeleteLeadDocument, useLeadAffiliations, useAddLeadAffiliation, useRemoveLeadAffiliation, useUsers, useCityIndex } from '../hooks/queries'
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
import { UserPlus, Search, CalendarDays, ChevronLeft, ChevronRight, X, Upload, CircleDot, CheckCircle, Clock, AlertTriangle, Ban, PhoneOff, PhoneIncoming, PhoneMissed, Phone as PhoneIcon, Send, Settings, Plus, Trash2, History, Bot, ArrowRight, MessageSquare, Mail, MapPin, Building2, Briefcase, User, Hash, Globe, Paperclip, FileText, Link2, Copy, Check, Users } from 'lucide-react'
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
  branch: '', source: '', lead_channel: '', service_requested: '', details: '', status: 'new',
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
  const [filterAffiliatedUser, setFilterAffiliatedUser] = useState('')
  const [filterDateRange, setFilterDateRange] = useState('last30')
  const [customRange, setCustomRange] = useState({ from: undefined, to: undefined })
  const [datePopoverOpen, setDatePopoverOpen] = useState(false)
  const [captureLinked, setCaptureLinked] = useState(false)

  // Pagination
  const [pageSize, setPageSize] = useState(50)
  const [currentPage, setCurrentPage] = useState(0)

  // Side panel / dialogs
  const [selectedLead, setSelectedLead] = useState(null)
  const [editMode, setEditMode] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [createStep, setCreateStep] = useState(1)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [fieldsDialogOpen, setFieldsDialogOpen] = useState(false)
  const [error, setError] = useState('')

  const { panelContainer, isOpen: panelOpen } = useSidePanel(!!selectedLead)

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
    affiliated_user_id: filterAffiliatedUser || undefined,
  }
  const isSuperAdmin = user?.role === 'super_admin'
  const isAdminOrAbove = isSuperAdmin || user?.role === 'admin'
  const { data: allUsers } = useUsers({ enabled: isAdminOrAbove })
  const { data: leadsData, isLoading } = useLeads(filters)
  const { data: branches = [] } = useBranches()
  const { data: cities = [] } = useCityIndex()
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
      lead_channel: lead.lead_channel || '',
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
    <div className={panelOpen ? '-mx-4 -mt-6' : ''}>
      {/* Filters */}
      <div className={panelOpen ? 'px-4 py-3 border-b space-y-2' : 'flex gap-3 flex-wrap items-center mb-4'}>
        {panelOpen ? (
          <>
            <div className="flex gap-2 items-center flex-wrap">
              {user?.role === 'super_admin' && (
                <Select value={filterCompany || 'all'} onValueChange={(v) => setFilterCompany(v === 'all' ? '' : v)}>
                  <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('leads.allCompanies')}</SelectItem>
                    <SelectItem value="babait">Babait</SelectItem>
                    <SelectItem value="aviezer">Aviezer</SelectItem>
                  </SelectContent>
                </Select>
              )}
              <Select value={filterType || 'all'} onValueChange={(v) => setFilterType(v === 'all' ? '' : v)}>
                <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('leads.allTypes')}</SelectItem>
                  <SelectItem value="patient">{t('leads.typePatient')}</SelectItem>
                  <SelectItem value="caregiver">{t('leads.typeCaregiver')}</SelectItem>
                  <SelectItem value="foreign_caregiver">{t('leads.typeForeignCaregiver')}</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterStatus || 'all'} onValueChange={(v) => setFilterStatus(v === 'all' ? '' : v)}>
                <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue /></SelectTrigger>
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
                  <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('leads.allBranches')}</SelectItem>
                    {branchNames.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              <Popover open={datePopoverOpen} onOpenChange={setDatePopoverOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="gap-2 h-8 px-3 text-xs">
                    <CalendarDays size={12} />
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
                          className={`text-start text-sm px-3 py-1.5 rounded-md transition-colors hover:bg-accent ${filterDateRange === preset ? 'bg-accent font-medium' : ''}`}
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
            <div className="relative">
              <Search size={14} className="absolute start-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="ps-8 w-full h-8 text-sm"
                placeholder={t('leads.search')}
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
              />
            </div>
          </>
        ) : (
          <>
            <div className="relative me-auto">
              <Search size={14} className="absolute start-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="ps-8 w-[220px] h-9"
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
                        className={`text-start text-sm px-3 py-1.5 rounded-md transition-colors hover:bg-accent ${filterDateRange === preset ? 'bg-accent font-medium' : ''}`}
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
          </>
        )}
      </div>

      {error && (
        <div className="p-3 mb-4 text-sm rounded-md bg-destructive/10 text-destructive border border-destructive/20">{error}</div>
      )}

      {/* Stat cards — hidden when side panel is open */}
      {!panelOpen && <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
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
      </div>}

      {/* Table */}
      {panelOpen ? (
        /* Table without Card wrapper when panel is open — no border, no margin, edge-to-edge */
        <div className="flex-1 min-h-0 overflow-auto">
          <Table className="[&_th:first-child]:ps-3 [&_td:first-child]:ps-3">
            <TableHeader>
              <TableRow>
                <TableHead>{t('common.name')}</TableHead>
                <TableHead>{t('leads.type')}</TableHead>
                <TableHead>{t('leads.phone')}</TableHead>
                <TableHead>{t('leads.city')}</TableHead>
                <TableHead>{t('leads.branch')}</TableHead>
                <TableHead>{t('leads.serviceRequested')}</TableHead>
                <TableHead>{t('common.status')}</TableHead>
                <TableHead>Maskyoo</TableHead>
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
                    <TableCell className="font-medium">
                      <span className="flex items-center gap-1.5">
                        {lead.source === 'chatbot' && <Bot size={13} className="text-violet-500 shrink-0" title="Lead Bot" />}
                        {lead.name}
                        {lead.metadata?.history?.length > 0 && (
                          <Badge className="bg-orange-500/10 text-orange-600 border-0 text-[9px] py-0 px-1.5 shrink-0">{t('leads.recurring')}</Badge>
                        )}
                      </span>
                    </TableCell>
                    <TableCell>{lead.type === 'patient' ? '🧑‍🦳' : lead.type === 'caregiver' ? '👩‍⚕️' : '🌍'} {t(`leads.type_${lead.type}`)}</TableCell>
                    <TableCell>{lead.phone}</TableCell>
                    <TableCell>{lead.city || '-'}</TableCell>
                    <TableCell>{lead.branch || '-'}</TableCell>
                    <TableCell>{lead.service_requested || '-'}</TableCell>
                    <TableCell>
                      <Badge className={`${sc.color} border-0`}>{t(`leads.status_${lead.status}`)}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">{lead.maskyoo_user || '-'}</TableCell>
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
                  <ChevronLeft size={14} className="icon-directional" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" disabled={currentPage >= totalPages - 1} onClick={() => setCurrentPage(currentPage + 1)}>
                  <ChevronRight size={14} className="icon-directional" />
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Full table with Card when no panel */
        <Card>
          <Table className="[&_th:first-child]:ps-3 [&_td:first-child]:ps-3">
            <TableHeader>
              <TableRow>
                <TableHead>{t('common.name')}</TableHead>
                <TableHead>{t('leads.type')}</TableHead>
                <TableHead>{t('leads.phone')}</TableHead>
                <TableHead>{t('leads.city')}</TableHead>
                <TableHead>{t('leads.branch')}</TableHead>
                <TableHead>{t('leads.serviceRequested')}</TableHead>
                <TableHead>{t('common.status')}</TableHead>
                <TableHead>Maskyoo</TableHead>
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
                    <TableCell className="font-medium">
                      <span className="flex items-center gap-1.5">
                        {lead.source === 'chatbot' && <Bot size={13} className="text-violet-500 shrink-0" title="Lead Bot" />}
                        {lead.name}
                        {lead.metadata?.history?.length > 0 && (
                          <Badge className="bg-orange-500/10 text-orange-600 border-0 text-[9px] py-0 px-1.5 shrink-0">{t('leads.recurring')}</Badge>
                        )}
                      </span>
                    </TableCell>
                    <TableCell>{lead.type === 'patient' ? '🧑‍🦳' : lead.type === 'caregiver' ? '👩‍⚕️' : '🌍'} {t(`leads.type_${lead.type}`)}</TableCell>
                    <TableCell>{lead.phone}</TableCell>
                    <TableCell>{lead.city || '-'}</TableCell>
                    <TableCell>{lead.branch || '-'}</TableCell>
                    <TableCell>{lead.service_requested || '-'}</TableCell>
                    <TableCell>
                      <Badge className={`${sc.color} border-0`}>{t(`leads.status_${lead.status}`)}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">{lead.maskyoo_user || '-'}</TableCell>
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
                  <ChevronLeft size={14} className="icon-directional" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" disabled={currentPage >= totalPages - 1} onClick={() => setCurrentPage(currentPage + 1)}>
                  <ChevronRight size={14} className="icon-directional" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

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
                <LeadFormFields form={form} setForm={setForm} t={t} branches={branches} cities={cities} leadFields={leadFields} showCompany={user?.role === 'super_admin'} />
              </form>
            ) : (
              <LeadDetail lead={selectedLead} t={t} leadFields={leadFields} isSuperAdmin={user?.role === 'super_admin'} userRole={user?.role} />
            )}
          </div>
          {!editMode && <LeadCommentInput leadId={selectedLead.id} t={t} />}
        </div>,
        panelContainer
      )}

      {/* Create dialog */}
      <Dialog open={createDialogOpen} onOpenChange={(open) => { setCreateDialogOpen(open); if (!open) { setForm(emptyForm); setCreateStep(1) } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('leads.dialogTitle')}</DialogTitle>
            {/* Step indicator */}
            <div className="flex items-center gap-2 pt-2">
              {[{ step: 1, label: t('leads.company') }, { step: 2, label: t('leads.type') }, { step: 3, label: t('leads.sectionContact') }].map(({ step, label }, i) => (
                <div key={step} className="flex items-center gap-2">
                  {i > 0 && <ChevronRight className="w-3 h-3 text-muted-foreground/50 icon-directional" />}
                  <div className={`flex items-center gap-1.5 text-xs font-medium ${createStep === step ? 'text-primary' : createStep > step ? 'text-muted-foreground' : 'text-muted-foreground/50'}`}>
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${createStep === step ? 'bg-primary text-primary-foreground' : createStep > step ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>{step}</span>
                    {label}
                  </div>
                </div>
              ))}
            </div>
          </DialogHeader>

          {/* Step 1: Company / Org */}
          {createStep === 1 && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(COMPANY_LOGOS).map(([key, { src, label }]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => { setForm({ ...form, company: key }); setCreateStep(2) }}
                    className={`flex flex-col items-center gap-3 rounded-xl border-2 p-6 transition-all cursor-pointer
                      ${form.company === key
                        ? 'border-primary bg-primary/5 shadow-sm'
                        : 'border-muted hover:border-muted-foreground/30 hover:bg-muted/30'}`}
                  >
                    <img src={src} alt={label} className="h-12 w-auto object-contain" />
                    <span className="text-sm font-medium">{label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Type (patient vs employee) */}
          {createStep === 2 && (
            <div className="space-y-4 py-2">
              {/* Company reminder */}
              <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
                <img src={COMPANY_LOGOS[form.company]?.src} alt="" className="h-5 w-auto" />
                <span className="text-sm font-medium">{COMPANY_LOGOS[form.company]?.label}</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { type: 'patient', icon: '🧑‍🦳', labelKey: 'leads.typeNewPatient' },
                  { type: 'caregiver', icon: '👩‍⚕️', labelKey: 'leads.typeNewEmployee' },
                ].map(({ type, icon, labelKey }) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => { setForm({ ...form, type }); setCreateStep(3) }}
                    className={`flex flex-col items-center gap-2 rounded-xl border-2 p-6 transition-all cursor-pointer
                      ${form.type === type
                        ? 'border-primary bg-primary/5 shadow-sm'
                        : 'border-muted hover:border-muted-foreground/30 hover:bg-muted/30'}`}
                  >
                    <span className="text-3xl">{icon}</span>
                    <span className="text-sm font-medium">{t(labelKey)}</span>
                  </button>
                ))}
              </div>
              <div className="flex justify-start">
                <Button type="button" variant="ghost" size="sm" onClick={() => setCreateStep(1)} className="gap-1.5">
                  <ChevronLeft className="w-4 h-4 icon-directional" /> {t('common.back')}
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Form fields */}
          {createStep === 3 && (
            <form onSubmit={handleCreate} className="space-y-4">
              {/* Summary of selections */}
              <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
                <img src={COMPANY_LOGOS[form.company]?.src} alt="" className="h-5 w-auto" />
                <span className="text-sm font-medium">{COMPANY_LOGOS[form.company]?.label}</span>
                <span className="text-muted-foreground">·</span>
                <span className="text-sm">{TYPE_ICONS[form.type]} {t(`leads.type_${form.type}`)}</span>
              </div>
              <LeadFormFields form={form} setForm={setForm} t={t} branches={branches} cities={cities} leadFields={leadFields} hideTypeSelector />
              <div className="flex gap-2 justify-between">
                <Button type="button" variant="ghost" onClick={() => setCreateStep(2)} className="gap-1.5">
                  <ChevronLeft className="w-4 h-4 icon-directional" /> {t('common.back')}
                </Button>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>{t('common.cancel')}</Button>
                  <Button type="submit" disabled={createLead.isPending}>{createLead.isPending ? t('common.saving') : t('common.create')}</Button>
                </div>
              </div>
            </form>
          )}
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
        <div className="flex gap-2 items-center">
          {/* Capture link */}
          {user?.capture_token && (
            <Button
              variant="ghost" size="sm" className="gap-1.5"
              onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}/lead/${user.capture_token}`)
                setCaptureLinked(true)
                setTimeout(() => setCaptureLinked(false), 2000)
              }}
            >
              {captureLinked ? <Check size={14} className="text-emerald-500" /> : <Link2 size={14} />}
              {captureLinked ? t('leads.linkCopied') : t('leads.captureLink')}
            </Button>
          )}
          {/* Super admin: filter by user */}
          {user?.role === 'super_admin' && allUsers?.length > 0 && (
            <Select value={filterAffiliatedUser || 'all'} onValueChange={(v) => setFilterAffiliatedUser(v === 'all' ? '' : v)}>
              <SelectTrigger className="h-8 w-[180px] text-xs">
                <Users size={12} className="me-1" />
                <SelectValue placeholder={t('leads.allUsers')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('leads.allUsers')}</SelectItem>
                {allUsers.map((u) => (
                  <SelectItem key={u.id} value={String(u.id)}>
                    {u.first_name || u.email} {u.role === 'marketeur' ? '(M)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {user?.role !== 'marketeur' && (
            <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setFieldsDialogOpen(true)}>
              <Settings size={14} />
              {t('leads.manageFields')}
            </Button>
          )}
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

// ─── Dropdown options ───────────────────────────────────
const SERVICE_OPTIONS = [
  'סיעוד וזכאות', 'עובד זר', 'מטפל/ת', 'יעוץ', 'שירות פרטי',
  'השגחה בבית חולים', 'אחות פרטית', 'שירות אמבולנס', 'מחפש עבודה',
]

const SOURCE_OPTIONS = [
  'manual', 'website', 'phone', 'whatsapp', 'chatbot', 'referral', 'facebook', 'google', 'csv_import',
]

const CHANNEL_OPTIONS = [
  'phone', 'whatsapp', 'website', 'email', 'chat', 'walk-in', 'facebook', 'referral',
]

const POSITION_OPTIONS = [
  'מטפל/ת', 'עובד/ת זר/ה', 'אחות', 'מנהל/ת בית', 'עובד/ת סוציאלי/ת', 'פיזיותרפיסט/ית',
]

function SelectWithOther({ value, onChange, options, placeholder, t }) {
  const [isOther, setIsOther] = useState(false)

  useEffect(() => {
    if (value && !options.includes(value)) setIsOther(true)
  }, [])

  if (isOther) {
    return (
      <div className="flex gap-1.5">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1"
        />
        <Button type="button" variant="ghost" size="sm" className="px-2 shrink-0" onClick={() => { onChange(''); setIsOther(false) }}>
          <X size={14} />
        </Button>
      </div>
    )
  }

  return (
    <Select value={value || '__empty__'} onValueChange={(v) => {
      if (v === '__other__') { setIsOther(true); onChange('') }
      else if (v === '__empty__') onChange('')
      else onChange(v)
    }}>
      <SelectTrigger><SelectValue placeholder={placeholder || '-'} /></SelectTrigger>
      <SelectContent>
        <SelectItem value="__empty__">-</SelectItem>
        {options.map((opt) => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
        <SelectItem value="__other__" className="text-muted-foreground italic">{t('common.other')}</SelectItem>
      </SelectContent>
    </Select>
  )
}

function CityCombobox({ value, onChange, cities, placeholder }) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const uniqueCities = useMemo(() => [...new Set((cities || []).map((c) => c.city).filter(Boolean))].sort(), [cities])
  const filtered = uniqueCities.filter((c) => c.includes(search))

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="w-full justify-between font-normal h-9 px-3">
          <span className={value ? '' : 'text-muted-foreground'}>{value || placeholder || '-'}</span>
          <ChevronRight className="w-3 h-3 rotate-90 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <div className="p-2 border-b">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חיפוש..."
            className="h-8 text-sm"
            autoFocus
          />
        </div>
        <div className="max-h-48 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <div className="p-2 text-xs text-muted-foreground text-center">
              {search && <button type="button" className="text-primary underline" onClick={() => { onChange(search); setOpen(false); setSearch('') }}>"{search}"</button>}
            </div>
          ) : (
            filtered.map((city) => (
              <button
                key={city}
                type="button"
                onClick={() => { onChange(city); setOpen(false); setSearch('') }}
                className={`w-full text-start px-2 py-1.5 text-sm rounded-sm hover:bg-muted transition-colors ${value === city ? 'bg-primary/10 font-medium' : ''}`}
              >
                {city}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ─── Lead Form Fields (reusable) ────────────────────────
const TYPE_ICONS = { patient: '🧑‍🦳', caregiver: '👩‍⚕️', foreign_caregiver: '🌍' }

function FormSection({ icon: Icon, title, children }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        {Icon && <Icon size={13} />}
        {title}
      </div>
      {children}
    </div>
  )
}

function LeadFormFields({ form, setForm, t, branches, cities, leadFields, showCompany, hideTypeSelector }) {
  const isPatient = form.type === 'patient'
  const isCaregiver = form.type === 'caregiver'
  const isForeignCaregiver = form.type === 'foreign_caregiver'

  return (
    <>
      {/* ── Type selector (hidden when using stepper) ── */}
      {!hideTypeSelector && (
        <div className="space-y-2">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('leads.type')}</Label>
          <div className="grid grid-cols-3 gap-2">
            {['patient', 'caregiver', 'foreign_caregiver'].map((typ) => (
              <button
                key={typ}
                type="button"
                onClick={() => setForm({ ...form, type: typ })}
                className={`flex flex-col items-center gap-1 rounded-lg border-2 p-3 transition-all text-center
                  ${form.type === typ
                    ? 'border-primary bg-primary/5 shadow-sm'
                    : 'border-muted hover:border-muted-foreground/30 hover:bg-muted/30'}`}
              >
                <span className="text-xl">{TYPE_ICONS[typ]}</span>
                <span className="text-xs font-medium">{t(`leads.type_${typ}`)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {showCompany && !hideTypeSelector && (
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
      )}

      {/* ── Contact info (all types) ── */}
      <FormSection icon={User} title={t('leads.sectionContact')}>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">{t('common.name')} *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder={isPatient ? t('leads.placeholderPatientName') : t('leads.placeholderName')} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t('leads.phone')} *</Label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required placeholder="05x-xxx-xxxx" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">{t('common.email')}</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t('leads.city')}</Label>
            <CityCombobox value={form.city} onChange={(v) => setForm({ ...form, city: v })} cities={cities} placeholder={t('leads.city')} />
          </div>
        </div>
      </FormSection>

      {/* ── Patient-specific fields ── */}
      {isPatient && (
        <FormSection icon={Building2} title={t('leads.sectionService')}>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">{t('leads.serviceRequested')}</Label>
              <SelectWithOther value={form.service_requested} onChange={(v) => setForm({ ...form, service_requested: v })} options={SERVICE_OPTIONS} placeholder={t('leads.placeholderService')} t={t} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t('leads.branch')}</Label>
              <Select value={form.branch || 'none'} onValueChange={(v) => setForm({ ...form, branch: v === 'none' ? '' : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">-</SelectItem>
                  {branches.map((b) => <SelectItem key={b.id} value={b.name}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </FormSection>
      )}

      {/* ── Caregiver-specific fields ── */}
      {(isCaregiver || isForeignCaregiver) && (
        <FormSection icon={Briefcase} title={t('leads.sectionProfessional')}>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">{t('leads.positionType')}</Label>
              <SelectWithOther value={form.position_type} onChange={(v) => setForm({ ...form, position_type: v })} options={POSITION_OPTIONS} placeholder={t('leads.placeholderPosition')} t={t} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t('leads.serviceRequested')}</Label>
              <SelectWithOther value={form.service_requested} onChange={(v) => setForm({ ...form, service_requested: v })} options={SERVICE_OPTIONS} t={t} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">{t('leads.branch')}</Label>
              <Select value={form.branch || 'none'} onValueChange={(v) => setForm({ ...form, branch: v === 'none' ? '' : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">-</SelectItem>
                  {branches.map((b) => <SelectItem key={b.id} value={b.name}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {isForeignCaregiver && (
              <div className="space-y-1.5">
                <Label className="text-xs">{t('leads.nationality')}</Label>
                <Input
                  value={form.custom_fields?.nationality || ''}
                  onChange={(e) => setForm({ ...form, custom_fields: { ...form.custom_fields, nationality: e.target.value } })}
                  placeholder={t('leads.placeholderNationality')}
                />
              </div>
            )}
          </div>
        </FormSection>
      )}

      {/* ── Routing & tracking (all types) ── */}
      <FormSection icon={MapPin} title={t('leads.sectionRouting')}>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">{t('leads.source')}</Label>
            <SelectWithOther value={form.source} onChange={(v) => setForm({ ...form, source: v })} options={SOURCE_OPTIONS} t={t} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t('leads.leadChannel')}</Label>
            <SelectWithOther value={form.lead_channel || ''} onChange={(v) => setForm({ ...form, lead_channel: v })} options={CHANNEL_OPTIONS} t={t} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">{t('common.status')}</Label>
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
        </div>
      </FormSection>

      {/* ── Notes ── */}
      <div className="space-y-1.5">
        <Label className="text-xs">{t('common.details')}</Label>
        <Textarea value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} rows={3} placeholder={t('leads.placeholderDetails')} />
      </div>

      {/* ── Custom fields ── */}
      {leadFields.length > 0 && (
        <FormSection icon={Hash} title={t('leads.customFields')}>
          {leadFields.map((fd) => (
            <div key={fd.id} className="space-y-1">
              <Label className="text-xs">{fd.label} {fd.required && '*'}</Label>
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
                  required={fd.required}
                />
              )}
            </div>
          ))}
        </FormSection>
      )}
    </>
  )
}

// ─── Lead Detail (read-only) ────────────────────────────
const MASKYOO_STATUS = {
  ANSWERED: { color: 'bg-emerald-500/10 text-emerald-600', icon: PhoneIncoming },
  NO_ANSWER: { color: 'bg-red-500/10 text-red-600', icon: PhoneMissed },
  BUSY: { color: 'bg-orange-500/10 text-orange-600', icon: PhoneIcon },
  FAILED: { color: 'bg-gray-500/10 text-gray-500', icon: PhoneMissed },
}
function getMaskyooStatus(status) {
  if (!status) return MASKYOO_STATUS.ANSWERED
  const u = String(status).toUpperCase()
  if (u.includes('ANSWER') && !u.includes('NO')) return MASKYOO_STATUS.ANSWERED
  if (u.includes('NO') || u.includes('MISS')) return MASKYOO_STATUS.NO_ANSWER
  if (u.includes('BUSY')) return MASKYOO_STATUS.BUSY
  return MASKYOO_STATUS.FAILED
}
function formatCallDuration(seconds) {
  const s = Number(seconds) || 0
  if (s === 0) return '-'
  const m = Math.floor(s / 60)
  const sec = s % 60
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`
}
function formatCallDate(dt) {
  if (!dt) return '-'
  try {
    const d = new Date(dt)
    const pad = (n) => String(n).padStart(2, '0')
    return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
  } catch { return dt }
}

const FIELD_LABELS = {
  name: 'common.name', phone: 'leads.phone', email: 'common.email', city: 'leads.city',
  branch: 'leads.branch', source: 'leads.source', service_requested: 'leads.serviceRequested',
  service_type: 'leads.serviceType', coordinator: 'leads.coordinator', status: 'common.status',
  type: 'leads.type', company: 'leads.company', details: 'common.details',
  position_type: 'leads.positionType', campaign: 'leads.campaign', lead_channel: 'leads.leadChannel',
}

const ACTION_CONFIG = {
  created: { icon: CircleDot, color: 'text-blue-500', bg: 'bg-blue-500', labelKey: 'leads.action_created' },
  updated: { icon: Settings, color: 'text-orange-500', bg: 'bg-orange-500', labelKey: 'leads.action_updated' },
  status_changed: { icon: ArrowRight, color: 'text-emerald-500', bg: 'bg-emerald-500', labelKey: 'leads.action_status_changed' },
  dispatched: { icon: Send, color: 'text-indigo-500', bg: 'bg-indigo-500', labelKey: 'leads.action_dispatched' },
  enriched: { icon: UserPlus, color: 'text-purple-500', bg: 'bg-purple-500', labelKey: 'leads.action_enriched' },
  call: { icon: PhoneIncoming, color: 'text-cyan-500', bg: 'bg-cyan-500', labelKey: 'leads.action_call' },
  history: { icon: History, color: 'text-gray-400', bg: 'bg-gray-400', labelKey: 'leads.action_history' },
  bot: { icon: Bot, color: 'text-violet-500', bg: 'bg-violet-500', labelKey: 'leads.action_bot' },
  comment: { icon: MessageSquare, color: 'text-amber-600', bg: 'bg-amber-500', labelKey: 'leads.action_comment' },
  bot_transcript: { icon: Bot, color: 'text-violet-500', bg: 'bg-violet-500', labelKey: 'leads.action_bot_transcript' },
}

function LeadDetail({ lead, t, leadFields, isSuperAdmin, userRole }) {
  const sc = STATUS_CONFIG[lead.status] || STATUS_CONFIG.new
  const { data: maskyooCalls } = useLeadCalls(lead.id)
  const { data: activities } = useLeadActivities(lead.id)

  const isBot = (actor) => actor === 'chatbot' || actor === 'bot'

  // Build unified timeline from all sources
  const timeline = useMemo(() => {
    const items = []

    // DB activities (created, updated, status_changed, dispatched, enriched)
    if (activities?.length) {
      for (const a of activities) {
        const type = isBot(a.actor) && a.action === 'created' ? 'created' : a.action
        items.push({ type, date: a.created_at, actor: a.actor, changes: a.changes, metadata: a.metadata, id: a.id, isBot: isBot(a.actor) })
      }
    }

    // Maskyoo calls
    if (maskyooCalls?.length) {
      for (const call of maskyooCalls) {
        items.push({
          type: 'call', date: call.start_call, id: `call-${call.cdr_uniqueid}`,
          actor: call.user_name || 'Maskyoo',
          metadata: { call_status: call.call_status, duration: call.call_duration, ddi: call.cdr_ddi, user_phone: call.user_phone },
        })
      }
    }

    // Legacy metadata.history (for older leads without activities)
    if (lead.metadata?.history?.length) {
      for (const [i, entry] of lead.metadata.history.entries()) {
        items.push({
          type: 'history', date: entry.date, id: `hist-${i}`,
          actor: entry.source || 'system',
          metadata: { lead_channel: entry.lead_channel, service_requested: entry.service_requested, details: entry.details, campaign: entry.campaign, name: entry.name },
        })
      }
    }

    // Always include creation event if no activity for it
    if (!items.some(i => i.type === 'created')) {
      items.push({ type: 'created', date: lead.created_at, id: 'creation', actor: lead.source || 'system', metadata: { source: lead.source, lead_channel: lead.lead_channel }, isBot: lead.source === 'chatbot' })
    }

    // Sort oldest first (chronological)
    items.sort((a, b) => new Date(a.date) - new Date(b.date))
    return items
  }, [activities, maskyooCalls, lead])

  const formatDate = (dt) => {
    if (!dt) return '-'
    const d = new Date(dt)
    const pad = (n) => String(n).padStart(2, '0')
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  const relativeTime = (dt) => {
    if (!dt) return ''
    const diff = Date.now() - new Date(dt).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return t('leads.justNow')
    if (mins < 60) return t('leads.minutesAgo', { n: mins })
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return t('leads.hoursAgo', { n: hrs })
    const days = Math.floor(hrs / 24)
    if (days < 7) return t('leads.daysAgo', { n: days })
    return formatDate(dt)
  }

  return (
    <div className="space-y-4">
      {/* Lead header */}
      <div className="rounded-xl border bg-card shadow-soft-sm overflow-hidden">
        {/* Top banner with avatar + name */}
        <div className="bg-gradient-to-r from-primary/8 to-primary/3 dark:from-primary/15 dark:to-primary/5 px-4 py-4">
          <div className="flex items-start gap-3">
            <div className="h-11 w-11 rounded-full bg-primary/15 dark:bg-primary/25 flex items-center justify-center shrink-0 ring-2 ring-background shadow-soft-sm">
              <span className="text-sm font-bold text-primary">{(lead.name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}</span>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-base leading-tight truncate">{lead.name}</h3>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                <Badge className={`${sc.color} border-0 text-[10px] py-0`}>{t(`leads.status_${lead.status}`)}</Badge>
                <Badge variant="outline" className="text-[10px] py-0">{t(`leads.type_${lead.type}`)}</Badge>
                {lead.source === 'chatbot' && (
                  <Badge className="bg-violet-500/10 text-violet-600 dark:text-violet-400 border-0 gap-0.5 text-[10px] py-0">
                    <Bot size={9} /> Bot
                  </Badge>
                )}
                {lead.metadata?.history?.length > 0 && (
                  <Badge className="bg-orange-500/10 text-orange-600 border-0 text-[10px] py-0">{t('leads.recurring')}</Badge>
                )}
              </div>
            </div>
            {isSuperAdmin && COMPANY_LOGOS[lead.company] && (
              <div className="flex items-center gap-1.5 shrink-0">
                <img src={COMPANY_LOGOS[lead.company].src} alt={lead.company} className="h-6 w-6 rounded object-contain" />
              </div>
            )}
          </div>
        </div>

        {/* Contact info */}
        <div className="px-4 py-3 space-y-1.5 border-b">
          <ContactRow icon={PhoneIcon} value={lead.phone} href={`tel:${lead.phone}`} />
          {lead.email && <ContactRow icon={Mail} value={lead.email} href={`mailto:${lead.email}`} />}
          {lead.city && <ContactRow icon={MapPin} value={lead.city} />}
        </div>

        {/* Service info */}
        {(lead.branch || lead.service_requested || lead.service_type) && (
          <div className="px-4 py-3 space-y-1.5 border-b">
            {lead.branch && <ContactRow icon={Building2} label={t('leads.branch')} value={lead.branch} />}
            {lead.service_requested && <ContactRow icon={Briefcase} label={t('leads.serviceRequested')} value={lead.service_requested} />}
            {lead.service_type && <ContactRow icon={Hash} label={t('leads.serviceType')} value={lead.service_type} />}
          </div>
        )}

        {/* Details */}
        {lead.details && (
          <div className="px-4 py-3 border-b">
            <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{lead.details}</p>
          </div>
        )}

        {/* Custom fields */}
        {leadFields.length > 0 && Object.keys(lead.custom_fields || {}).length > 0 && (
          <div className="px-4 py-3 space-y-1.5">
            {leadFields.map((fd) => {
              const val = lead.custom_fields?.[fd.field_key]
              if (!val) return null
              return <ContactRow key={fd.id} icon={Hash} label={fd.label} value={val} />
            })}
          </div>
        )}

        {/* Meta footer */}
        <div className="px-4 py-2 bg-muted/30 flex items-center justify-between text-[10px] text-muted-foreground">
          <span>{t('leads.createdAt')} {formatDate(lead.created_at)}</span>
          {lead.source && <Badge variant="outline" className="text-[9px] py-0 h-4">{lead.source}</Badge>}
        </div>
      </div>

      {/* Timeline */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <History size={14} className="text-muted-foreground" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('leads.timeline')}</span>
          <span className="text-[10px] text-muted-foreground/60">({timeline.length})</span>
        </div>
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-[9px] top-3 bottom-3 w-[2px] bg-border/60 rounded-full" />

          <div className="space-y-1">
            {timeline.map((item) => {
              const cfg = item.isBot ? ACTION_CONFIG.bot : (ACTION_CONFIG[item.type] || ACTION_CONFIG.history)
              const Icon = item.isBot && item.type !== 'call' ? Bot : cfg.icon
              const label = item.isBot && item.type === 'created' ? t('leads.action_bot_created') : t(cfg.labelKey)
              return (
                <div key={item.id} className="relative flex gap-3 py-2 group">
                  {/* Dot */}
                  <div className={`relative z-10 mt-0.5 h-[20px] w-[20px] rounded-full border-2 border-background ${cfg.bg} flex items-center justify-center shrink-0 shadow-sm`}>
                    <Icon size={10} className="text-white" strokeWidth={2.5} />
                  </div>
                  {/* Content card */}
                  <div className="flex-1 min-w-0 rounded-lg border bg-card/50 px-3 py-2 group-hover:bg-card transition-colors">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs font-semibold ${cfg.color}`}>{label}</span>
                        {item.isBot && item.type !== 'created' && (
                          <Bot size={11} className="text-violet-500" />
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap" title={formatDate(item.date)}>{relativeTime(item.date)}</span>
                    </div>
                    {item.actor && (
                      <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                        {item.isBot ? <Bot size={9} className="text-violet-400" /> : null}
                        <span>{t('leads.by')} {item.isBot ? t('leads.botAI') : item.actor}</span>
                      </div>
                    )}

                    {/* Status change details */}
                    {item.type === 'status_changed' && item.changes?.status && (
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <Badge variant="outline" className="text-[10px] py-0">{t(`leads.status_${item.changes.status.from}`) || item.changes.status.from || 'new'}</Badge>
                        <ArrowRight size={10} className="text-muted-foreground icon-directional" />
                        <Badge className={`${(STATUS_CONFIG[item.changes.status.to] || STATUS_CONFIG.new).color} border-0 text-[10px] py-0`}>
                          {t(`leads.status_${item.changes.status.to}`) || item.changes.status.to}
                        </Badge>
                      </div>
                    )}

                    {/* Field changes */}
                    {item.type === 'updated' && item.changes && (
                      <div className="mt-1.5 space-y-1 border-t border-border/50 pt-1.5">
                        {Object.entries(item.changes).map(([field, { from, to }]) => (
                          <div key={field} className="text-[11px] flex items-center gap-1">
                            <span className="font-medium text-foreground">{t(FIELD_LABELS[field] || field)}</span>
                            {from ? (
                              <>
                                <span className="text-muted-foreground line-through">{String(from)}</span>
                                <ArrowRight size={8} className="text-muted-foreground shrink-0 icon-directional" />
                                <span className="text-foreground">{String(to)}</span>
                              </>
                            ) : (
                              <span className="text-foreground">{String(to)}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Dispatch details */}
                    {item.type === 'dispatched' && item.metadata?.branch && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                        <ArrowRight size={10} className="icon-directional" />
                        <span className="font-medium">{item.metadata.branch}</span>
                      </div>
                    )}

                    {/* Call details */}
                    {item.type === 'call' && item.metadata && (
                      <div className="mt-1.5 flex items-center gap-2 text-[11px]">
                        <Badge className={`${getMaskyooStatus(item.metadata.call_status).color} border-0 text-[10px] py-0 gap-0.5`}>
                          {item.metadata.call_status || '-'}
                        </Badge>
                        <span className="text-muted-foreground">{formatCallDuration(item.metadata.duration)}</span>
                        {item.metadata.ddi && <span className="text-muted-foreground">{item.metadata.ddi}</span>}
                      </div>
                    )}

                    {/* Legacy history details */}
                    {item.type === 'history' && item.metadata && (
                      <div className="mt-1 space-y-0.5">
                        <div className="flex gap-1 flex-wrap">
                          {item.metadata.lead_channel && <Badge variant="outline" className="text-[10px] py-0">{item.metadata.lead_channel}</Badge>}
                          {item.metadata.campaign && <Badge variant="outline" className="text-[10px] py-0">{item.metadata.campaign}</Badge>}
                        </div>
                        {item.metadata.service_requested && <span className="text-xs block">{item.metadata.service_requested}</span>}
                        {item.metadata.details && <p className="text-[11px] text-muted-foreground whitespace-pre-wrap">{item.metadata.details}</p>}
                      </div>
                    )}

                    {/* Comment text */}
                    {item.type === 'comment' && item.metadata?.text && (
                      <p className="text-sm mt-1 whitespace-pre-wrap">{item.metadata.text}</p>
                    )}

                    {/* Bot transcript */}
                    {item.type === 'bot_transcript' && item.metadata?.transcript && (
                      <div className="mt-1.5 rounded border bg-violet-50/50 dark:bg-violet-950/20 p-2 max-h-48 overflow-y-auto">
                        <div className="text-[10px] text-muted-foreground mb-1">{item.metadata.message_count} {t('leads.messages')}</div>
                        <div className="space-y-1">
                          {item.metadata.transcript.split('\n').map((line, i) => (
                            <p key={i} className={`text-[11px] leading-relaxed ${line.startsWith('🤖') ? 'text-violet-600 dark:text-violet-400' : 'text-foreground'}`}>{line}</p>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Created metadata */}
                    {item.type === 'created' && item.metadata && (
                      <div className="mt-1 flex gap-1">
                        {item.metadata.source && <Badge variant="outline" className="text-[10px] py-0">{item.metadata.source}</Badge>}
                        {item.metadata.lead_channel && <Badge variant="outline" className="text-[10px] py-0">{item.metadata.lead_channel}</Badge>}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Documents section */}
      <LeadDocuments leadId={lead.id} t={t} />

      {/* Affiliations section (admin/super_admin only) */}
      {(userRole === 'super_admin' || userRole === 'admin') && (
        <LeadAffiliationsSection leadId={lead.id} t={t} />
      )}

    </div>
  )
}

function LeadDocuments({ leadId, t }) {
  const { data: documents } = useLeadDocuments(leadId)
  const uploadDoc = useUploadLeadDocument()
  const deleteDoc = useDeleteLeadDocument()

  const handleUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    uploadDoc.mutate({ leadId, file })
    e.target.value = ''
  }

  const formatSize = (bytes) => {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="px-4 py-3 border-t">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
          <Paperclip size={12} />
          {t('leads.documents')}
          {documents?.length > 0 && <Badge variant="secondary" className="text-[10px] py-0 px-1">{documents.length}</Badge>}
        </h4>
        <label className="cursor-pointer">
          <input type="file" className="hidden" onChange={handleUpload} disabled={uploadDoc.isPending} />
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" asChild>
            <span><Plus size={12} className="me-1" />{t('leads.uploadDoc')}</span>
          </Button>
        </label>
      </div>
      {documents?.length > 0 && (
        <div className="space-y-1.5">
          {documents.map(doc => (
            <div key={doc.id} className="flex items-center gap-2 text-xs group rounded px-2 py-1.5 hover:bg-muted/50">
              <FileText size={14} className="text-muted-foreground shrink-0" />
              <a href={doc.url} target="_blank" rel="noopener noreferrer" className="flex-1 truncate text-foreground hover:underline">
                {doc.name}
              </a>
              <span className="text-muted-foreground text-[10px] shrink-0">{formatSize(doc.size)}</span>
              <button
                onClick={() => deleteDoc.mutate({ leadId, docId: doc.id })}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
      {uploadDoc.isPending && (
        <p className="text-[11px] text-muted-foreground animate-pulse mt-1">{t('leads.uploading')}</p>
      )}
    </div>
  )
}

function LeadAffiliationsSection({ leadId, t }) {
  const { data: affiliations } = useLeadAffiliations(leadId)
  const { data: allUsers } = useUsers()
  const addAffiliation = useAddLeadAffiliation()
  const removeAffiliation = useRemoveLeadAffiliation()
  const [showAdd, setShowAdd] = useState(false)

  const affiliatedUserIds = new Set((affiliations || []).map(a => a.user_id))
  const availableUsers = (allUsers || []).filter(u => !affiliatedUserIds.has(u.id))

  return (
    <div className="px-4 py-3 border-t">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
          <Users size={12} />
          {t('leads.affiliations')}
          {affiliations?.length > 0 && <Badge variant="secondary" className="text-[10px] py-0 px-1">{affiliations.length}</Badge>}
        </h4>
        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setShowAdd(!showAdd)}>
          <Plus size={12} className="me-1" />{t('leads.addUser')}
        </Button>
      </div>

      {showAdd && availableUsers.length > 0 && (
        <div className="mb-2 max-h-32 overflow-y-auto border rounded p-1 space-y-0.5">
          {availableUsers.map(u => (
            <button
              key={u.id}
              onClick={() => { addAffiliation.mutate({ leadId, userId: u.id }); setShowAdd(false) }}
              className="w-full text-start text-xs px-2 py-1 rounded hover:bg-muted/70 flex items-center gap-2"
            >
              <User size={12} className="text-muted-foreground" />
              {u.first_name} {u.last_name || ''} <span className="text-muted-foreground">({u.role})</span>
            </button>
          ))}
        </div>
      )}

      {affiliations?.length > 0 && (
        <div className="space-y-1">
          {affiliations.map(a => (
            <div key={a.user_id} className="flex items-center gap-2 text-xs group rounded px-2 py-1 hover:bg-muted/50">
              <User size={12} className="text-muted-foreground" />
              <span className="flex-1">{a.user_first_name} {a.user_last_name || ''}</span>
              <Badge variant="outline" className="text-[10px] py-0">{a.source}</Badge>
              <button
                onClick={() => removeAffiliation.mutate({ leadId, userId: a.user_id })}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function LeadCommentInput({ leadId, t }) {
  const addComment = useAddLeadComment()
  const [text, setText] = useState('')
  return (
    <div className="shrink-0 border-t px-4 py-3 bg-background">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!text.trim()) return
          const msg = text.trim()
          setText('')
          addComment.mutate({ leadId, comment: msg })
        }}
        className="flex gap-2 items-end"
      >
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.target.form.requestSubmit() } }}
          placeholder={t('leads.addComment')}
          rows={3}
          className="flex-1 text-sm resize-none"
        />
        <Button type="submit" size="sm" className="h-9 px-3" disabled={!text.trim() || addComment.isPending}>
          <Send size={14} />
        </Button>
      </form>
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

function ContactRow({ icon: Icon, label, value, href }) {
  if (!value) return null
  const content = (
    <div className="flex items-center gap-2.5 py-1 group/row">
      <Icon size={14} className="text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        {label && <span className="text-[10px] text-muted-foreground block leading-none mb-0.5">{label}</span>}
        <span className={`text-sm ${href ? 'text-primary group-hover/row:underline' : 'text-foreground'} truncate block`}>{value}</span>
      </div>
    </div>
  )
  if (href) return <a href={href} onClick={e => e.stopPropagation()} className="block">{content}</a>
  return content
}
