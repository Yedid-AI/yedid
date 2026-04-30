import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import {
  useBranches,
  useCityIndex, useCreateCityEntry, useDeleteCityEntry,
  useDispatchConfig, useUpdateDispatchConfig, useConnectDispatchWhatsApp, useReconnectDispatchWhatsApp,
  useServiceConfig, useCreateService, useUpdateService, useDeleteService,
} from '../hooks/queries'
import { useI18n } from '../lib/i18n'
import { usePageTitle, usePageHeader } from '../lib/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Briefcase, MapPin, Trash2, Send, MessageCircle, Loader2, CheckCircle, Plus, Pencil } from 'lucide-react'

const DISPATCH_FIELDS = [
  { key: 'company', label: 'leads.company' },
  { key: 'name', label: 'leads.name' },
  { key: 'phone', label: 'leads.phone' },
  { key: 'email', label: 'common.email' },
  { key: 'city', label: 'leads.city' },
  { key: 'branch', label: 'leads.branch' },
  { key: 'coordinator', label: 'leads.coordinator' },
  { key: 'source', label: 'leads.source' },
  { key: 'lead_channel', label: 'leads.leadChannel' },
  { key: 'service_requested', label: 'leads.serviceRequested' },
  { key: 'service_type', label: 'leads.serviceType' },
  { key: 'details', label: 'leads.details' },
  { key: 'position_type', label: 'leads.positionType' },
  { key: 'experience', label: 'leads.experience' },
  { key: 'campaign', label: 'leads.campaign' },
]

const DAY_KEYS = ['branches.sun', 'branches.mon', 'branches.tue', 'branches.wed', 'branches.thu', 'branches.fri', 'branches.sat']

const FIELD_EMOJI = {
  company: '📋', name: '👤', phone: '📱', email: '📧', city: '📍',
  branch: '🏢', coordinator: '👷', source: '🔗', lead_channel: '📡',
  service_requested: '🏥', service_type: '📋', details: '💬',
  position_type: '💼', experience: '⭐', campaign: '📣',
}

const COMPANY_OPTIONS = ['babait', 'aviezer']

const emptyCityForm = { city: '', branch_name: '' }

export default function Branches() {
  const { t } = useI18n()
  usePageTitle(t('branches.title'))
  const { actionsContainer } = usePageHeader()

  const [cityForm, setCityForm] = useState(emptyCityForm)
  const [error, setError] = useState('')

  const { data: cities = [], isLoading: citiesLoading } = useCityIndex()
  const createCity = useCreateCityEntry()
  const deleteCity = useDeleteCityEntry()

  const handleAddCity = async (e) => {
    e.preventDefault()
    setError('')
    try {
      await createCity.mutateAsync(cityForm)
      setCityForm(emptyCityForm)
    } catch (err) {
      setError(err.message)
    }
  }

  const handleDeleteCity = async (id) => {
    try { await deleteCity.mutateAsync(id) } catch (err) { setError(err.message) }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <p className="text-sm text-muted-foreground mt-1">{t('branches.subtitle')}</p>
      </div>

      {error && (
        <div className="p-3 mb-4 text-sm rounded-md bg-destructive/10 text-destructive border border-destructive/20">{error}</div>
      )}

      <Tabs defaultValue="services">
        <TabsList>
          <TabsTrigger value="services" className="gap-1.5">
            <Briefcase size={14} />
            {t('branches.services')}
          </TabsTrigger>
          <TabsTrigger value="cities" className="gap-1.5">
            <MapPin size={14} />
            {t('branches.cityIndex')} ({cities.length})
          </TabsTrigger>
          <TabsTrigger value="dispatch" className="gap-1.5">
            <Send size={14} />
            {t('branches.dispatchConfig')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="services" className="mt-4">
          <ServicesTab t={t} />
        </TabsContent>

        <TabsContent value="cities" className="mt-4">
          <form onSubmit={handleAddCity} className="flex gap-3 mb-4 items-end">
            <div className="space-y-1.5 flex-1">
              <Label className="text-xs">{t('branches.city')}</Label>
              <Input value={cityForm.city} onChange={(e) => setCityForm({ ...cityForm, city: e.target.value })} required placeholder={t('branches.cityPlaceholder')} />
            </div>
            <div className="space-y-1.5 flex-1">
              <Label className="text-xs">{t('branches.branchName')}</Label>
              <Input value={cityForm.branch_name} onChange={(e) => setCityForm({ ...cityForm, branch_name: e.target.value })} required placeholder={t('branches.branchNamePlaceholder')} />
            </div>
            <Button type="submit" size="sm">{t('common.create')}</Button>
          </form>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('branches.city')}</TableHead>
                  <TableHead>{t('branches.branchName')}</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(citiesLoading || cities.length === 0) ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground py-6">
                      {citiesLoading ? t('common.loading') : t('branches.emptyCities')}
                    </TableCell>
                  </TableRow>
                ) : cities.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{c.city}</TableCell>
                    <TableCell>{c.branch_name}</TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDeleteCity(c.id)}>
                        <Trash2 size={14} />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="dispatch" className="mt-4">
          <DispatchConfigTab t={t} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ─── Services Tab ────────────────────────────────────────
const emptyServiceForm = {
  name: '', aliases: '', company: '', fixed_branch: '', display_order: 0, is_active: true,
}

function ServicesTab({ t }) {
  const { data: services = [], isLoading } = useServiceConfig()
  const { data: branches = [] } = useBranches()
  const createService = useCreateService()
  const updateService = useUpdateService()
  const deleteService = useDeleteService()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyServiceForm)
  const [error, setError] = useState('')

  const branchNames = useMemo(() => Array.from(new Set(branches.map(b => b.name).filter(Boolean))).sort(), [branches])

  const openCreate = () => {
    setEditing(null)
    setForm({ ...emptyServiceForm, display_order: (services.at(-1)?.display_order ?? 0) + 10 })
    setError('')
    setDialogOpen(true)
  }

  const openEdit = (svc) => {
    setEditing(svc)
    setForm({
      name: svc.name || '',
      aliases: (svc.aliases || []).join('\n'),
      company: svc.company || '',
      fixed_branch: svc.fixed_branch || '',
      display_order: svc.display_order ?? 0,
      is_active: !!svc.is_active,
    })
    setError('')
    setDialogOpen(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    const aliasList = form.aliases.split('\n').map(s => s.trim()).filter(Boolean)
    const body = {
      name: form.name.trim(),
      aliases: aliasList,
      company: form.company || null,
      fixed_branch: form.fixed_branch || null,
      display_order: Number(form.display_order) || 0,
      is_active: !!form.is_active,
    }
    try {
      if (editing) await updateService.mutateAsync({ id: editing.id, ...body })
      else await createService.mutateAsync(body)
      setDialogOpen(false)
    } catch (err) {
      setError(err.message)
    }
  }

  const handleDelete = async (id) => {
    setError('')
    try { await deleteService.mutateAsync(id) } catch (err) { setError(err.message) }
  }

  const toggleActive = async (svc) => {
    setError('')
    try { await updateService.mutateAsync({ id: svc.id, is_active: !svc.is_active }) } catch (err) { setError(err.message) }
  }

  return (
    <div>
      {error && (
        <div className="p-3 mb-4 text-sm rounded-md bg-destructive/10 text-destructive border border-destructive/20">{error}</div>
      )}

      <div className="flex justify-end mb-3">
        <Button size="sm" onClick={openCreate} className="gap-1.5">
          <Plus size={14} />
          {t('branches.services.add')}
        </Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('branches.services.name')}</TableHead>
              <TableHead>{t('branches.services.aliases')}</TableHead>
              <TableHead>{t('branches.services.company')}</TableHead>
              <TableHead>{t('branches.services.fixedBranch')}</TableHead>
              <TableHead>{t('branches.services.active')}</TableHead>
              <TableHead className="w-[120px]">{t('common.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(isLoading || services.length === 0) ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                  {isLoading ? t('common.loading') : t('branches.services.empty')}
                </TableCell>
              </TableRow>
            ) : services.map((s) => (
              <TableRow key={s.id} className={!s.is_active ? 'opacity-60' : ''}>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-[260px]">
                  {(s.aliases || []).length === 0
                    ? '-'
                    : (s.aliases || []).map((a) => <Badge key={a} variant="secondary" className="me-1 mb-1 text-[11px]">{a}</Badge>)}
                </TableCell>
                <TableCell>
                  {s.company ? <Badge variant="outline" className="capitalize">{s.company}</Badge> : '-'}
                </TableCell>
                <TableCell>{s.fixed_branch || '-'}</TableCell>
                <TableCell>
                  <Switch size="sm" checked={!!s.is_active} onCheckedChange={() => toggleActive(s)} />
                </TableCell>
                <TableCell className="flex gap-1">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(s)}>
                    <Pencil size={13} />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive">
                        <Trash2 size={13} />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t('branches.services.deleteTitle')}</AlertDialogTitle>
                        <AlertDialogDescription>{t('common.irreversible')}</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                        <AlertDialogAction variant="destructive" onClick={() => handleDelete(s.id)}>{t('common.delete')}</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditing(null) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? t('branches.services.editTitle') : t('branches.services.createTitle')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>{t('branches.services.name')}</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>

            <div className="space-y-2">
              <Label>{t('branches.services.aliases')}</Label>
              <Textarea
                value={form.aliases}
                onChange={(e) => setForm({ ...form, aliases: e.target.value })}
                rows={4}
                placeholder={'aliase 1\naliase 2'}
              />
              <p className="text-xs text-muted-foreground">{t('branches.services.aliasesHelp')}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{t('branches.services.company')}</Label>
                <Select value={form.company || '__none__'} onValueChange={(v) => setForm({ ...form, company: v === '__none__' ? '' : v })}>
                  <SelectTrigger><SelectValue placeholder="-" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">-</SelectItem>
                    {COMPANY_OPTIONS.map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('branches.services.order')}</Label>
                <Input type="number" value={form.display_order} onChange={(e) => setForm({ ...form, display_order: e.target.value })} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('branches.services.fixedBranch')}</Label>
              <Select value={form.fixed_branch || '__none__'} onValueChange={(v) => setForm({ ...form, fixed_branch: v === '__none__' ? '' : v })}>
                <SelectTrigger><SelectValue placeholder="-" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">-</SelectItem>
                  {branchNames.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{t('branches.services.fixedBranchHelp')}</p>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} id="svc-active" />
              <Label htmlFor="svc-active" className="cursor-pointer">{t('branches.services.active')}</Label>
            </div>

            {error && <div className="p-2 text-xs rounded bg-destructive/10 text-destructive border border-destructive/20">{error}</div>}

            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>{t('common.cancel')}</Button>
              <Button type="submit">{editing ? t('common.save') : t('common.create')}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Dispatch Configuration Tab ──────────────────────────
function DispatchConfigTab({ t }) {
  const { data: config, isLoading, refetch } = useDispatchConfig()
  const updateConfig = useUpdateDispatchConfig()
  const connectWhatsApp = useConnectDispatchWhatsApp()
  const reconnectWhatsApp = useReconnectDispatchWhatsApp()
  const [saving, setSaving] = useState(false)

  // Detect callback from Unipile QR scan popup
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('dispatch') === 'connected') {
      params.delete('dispatch')
      const newUrl = window.location.pathname + (params.toString() ? '?' + params.toString() : '')
      window.history.replaceState({}, '', newUrl)
      refetch()
    }
  }, [refetch])

  const [fields, setFields] = useState([])
  const [header, setHeader] = useState('')
  const [footer, setFooter] = useState('')
  const [days, setDays] = useState([0, 1, 2, 3, 4, 5, 6])
  const [hourStart, setHourStart] = useState(8)
  const [hourEnd, setHourEnd] = useState(20)
  const [autoDispatch, setAutoDispatch] = useState(false)

  useEffect(() => {
    if (config) {
      setFields(config.message_fields || [])
      setHeader(config.message_header || '')
      setFooter(config.message_footer || '')
      setDays(config.schedule_days || [0, 1, 2, 3, 4, 5, 6])
      setHourStart(config.schedule_hour_start ?? 8)
      setHourEnd(config.schedule_hour_end ?? 20)
      setAutoDispatch(config.auto_dispatch || false)
    }
  }, [config])

  const dispatchInbox = config?.inboxes

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateConfig.mutateAsync({
        message_fields: fields,
        message_header: header,
        message_footer: footer,
        schedule_days: days,
        schedule_hour_start: hourStart,
        schedule_hour_end: hourEnd,
        auto_dispatch: autoDispatch,
      })
    } catch (err) {
      console.error(err)
    }
    setSaving(false)
  }

  const toggleField = (key) => {
    setFields(prev => prev.includes(key) ? prev.filter(f => f !== key) : [...prev, key])
  }

  const toggleDay = (day) => {
    setDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort())
  }

  const handleConnectWhatsApp = async () => {
    try {
      const mutation = dispatchInbox ? reconnectWhatsApp : connectWhatsApp
      const data = await mutation.mutateAsync()
      if (data.url) {
        const w = 480, h = 720
        const left = window.screenX + Math.round((window.outerWidth - w) / 2)
        const top = window.screenY + Math.round((window.outerHeight - h) / 2)
        window.open(data.url, 'dispatch-whatsapp-auth', `width=${w},height=${h},left=${left},top=${top}`)
      }
    } catch (err) {
      console.error(err)
    }
  }

  // Live message preview
  const preview = useMemo(() => {
    const lines = []
    if (header) lines.push(header, '')
    const sampleLead = { company: 'BABAIT', name: 'Israel Cohen', phone: '+972501234567', email: 'israel@example.com', city: 'Tel Aviv', branch: 'Center', coordinator: 'David', source: 'Website', lead_channel: 'Web', service_requested: 'Home care', service_type: 'Daily', details: 'Needs morning assistance', position_type: 'Full time', experience: true, campaign: 'Google Ads' }
    for (const key of fields) {
      const val = sampleLead[key]
      if (!val) continue
      const emoji = FIELD_EMOJI[key] || '•'
      if (key === 'name') lines.push(`${emoji} *${val}*`)
      else if (key === 'company') lines.push(`${emoji} *${val}*`)
      else lines.push(`${emoji} ${val}`)
    }
    lines.push('\n🆔 Lead #1234')
    if (footer) lines.push('', footer)
    return lines.join('\n')
  }, [fields, header, footer])

  if (isLoading) return <div className="text-muted-foreground py-6 text-center">{t('common.loading')}</div>

  return (
    <div className="space-y-6">
      {/* Section 1: WhatsApp Connection */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-500 shrink-0">
                <MessageCircle size={18} />
              </div>
              <div>
                <h3 className="text-sm font-semibold">{t('branches.dispatchWhatsApp')}</h3>
                {dispatchInbox ? (
                  <p className="text-xs text-muted-foreground">
                    {dispatchInbox.name} {dispatchInbox.phone_number && `(${dispatchInbox.phone_number})`}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">{t('branches.noDispatchWhatsApp')}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {dispatchInbox && (
                <Badge variant="outline" className="gap-1 text-emerald-600 border-emerald-200 bg-emerald-50">
                  <CheckCircle size={12} />
                  {t('branches.dispatchConnected')}
                </Badge>
              )}
              <Button size="sm" variant={dispatchInbox ? 'outline' : 'default'} onClick={handleConnectWhatsApp} disabled={connectWhatsApp.isPending || reconnectWhatsApp.isPending}>
                {(connectWhatsApp.isPending || reconnectWhatsApp.isPending) ? <Loader2 size={14} className="animate-spin" /> : <MessageCircle size={14} />}
                <span className="ms-1.5">{dispatchInbox ? t('branches.reconnect') : t('branches.connectDispatchWhatsApp')}</span>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section 2: Message Template */}
      <Card>
        <CardContent className="pt-4 pb-4 space-y-4">
          <h3 className="text-sm font-semibold">{t('branches.messageTemplate')}</h3>

          <div className="space-y-2">
            <Label className="text-xs">{t('branches.messageHeader')}</Label>
            <Input value={header} onChange={(e) => setHeader(e.target.value)} placeholder={t('branches.messageHeaderPlaceholder')} />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">{t('branches.messageFields')}</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {DISPATCH_FIELDS.map((f) => (
                <label key={f.key} className="flex items-center gap-2 cursor-pointer text-sm">
                  <Checkbox checked={fields.includes(f.key)} onCheckedChange={() => toggleField(f.key)} />
                  <span>{FIELD_EMOJI[f.key] || '•'} {t(f.label)}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">{t('branches.messageFooter')}</Label>
            <Input value={footer} onChange={(e) => setFooter(e.target.value)} placeholder={t('branches.messageFooterPlaceholder')} />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">{t('branches.messagePreview')}</Label>
            <div className="bg-muted/50 rounded-lg p-3 text-sm whitespace-pre-wrap font-mono text-xs leading-relaxed border">
              {preview}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section 3: Schedule */}
      <Card>
        <CardContent className="pt-4 pb-4 space-y-4">
          <h3 className="text-sm font-semibold">{t('branches.schedule')}</h3>

          <div className="space-y-2">
            <Label className="text-xs">{t('branches.scheduleDays')}</Label>
            <div className="flex gap-2 flex-wrap">
              {DAY_KEYS.map((key, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => toggleDay(idx)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors border ${
                    days.includes(idx)
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-muted-foreground border-border hover:bg-muted'
                  }`}
                >
                  {t(key)}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-4 items-end">
            <div className="space-y-1.5">
              <Label className="text-xs">{t('branches.scheduleHourStart')}</Label>
              <Select value={String(hourStart)} onValueChange={(v) => setHourStart(parseInt(v))}>
                <SelectTrigger className="w-[90px] h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 24 }, (_, i) => (
                    <SelectItem key={i} value={String(i)}>{String(i).padStart(2, '0')}:00</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t('branches.scheduleHourEnd')}</Label>
              <Select value={String(hourEnd)} onValueChange={(v) => setHourEnd(parseInt(v))}>
                <SelectTrigger className="w-[90px] h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 24 }, (_, i) => (
                    <SelectItem key={i} value={String(i)}>{String(i).padStart(2, '0')}:00</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2 border-t">
            <Switch checked={autoDispatch} onCheckedChange={setAutoDispatch} id="auto-dispatch" />
            <div>
              <Label htmlFor="auto-dispatch" className="text-sm font-medium cursor-pointer">{t('branches.autoDispatch')}</Label>
              <p className="text-xs text-muted-foreground">{t('branches.autoDispatchDesc')}</p>
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
    </div>
  )
}
