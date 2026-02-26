import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useBranches, useCreateBranch, useUpdateBranch, useDeleteBranch, useCityIndex, useCreateCityEntry, useDeleteCityEntry, useDispatchConfig, useUpdateDispatchConfig, useConnectDispatchWhatsApp } from '../hooks/queries'
import { useI18n } from '../lib/i18n'
import { usePageTitle, usePageHeader } from '../lib/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { Building2, Home, MapPin, Trash2, Send, MessageCircle, Loader2, CheckCircle } from 'lucide-react'

const AVATAR_COLORS = [
  'bg-blue-500', 'bg-emerald-500', 'bg-violet-500', 'bg-amber-500',
  'bg-rose-500', 'bg-cyan-500', 'bg-fuchsia-500', 'bg-lime-600',
  'bg-indigo-500', 'bg-orange-500', 'bg-teal-500', 'bg-pink-500',
]

function nameColor(name) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

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

const emptyBranchForm = { name: '', contact_name: '', email: '', phone: '', mobile: '', address: '', whatsapp_phone: '' }
const emptyCityForm = { city: '', branch_name: '' }

export default function Branches() {
  const { t } = useI18n()
  usePageTitle(t('branches.title'))
  const { actionsContainer } = usePageHeader()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editBranch, setEditBranch] = useState(null)
  const [form, setForm] = useState(emptyBranchForm)
  const [cityForm, setCityForm] = useState(emptyCityForm)
  const [error, setError] = useState('')

  const { data: branches = [], isLoading } = useBranches()
  const { data: cities = [], isLoading: citiesLoading } = useCityIndex()
  const createBranch = useCreateBranch()
  const updateBranch = useUpdateBranch()
  const deleteBranch = useDeleteBranch()
  const createCity = useCreateCityEntry()
  const deleteCity = useDeleteCityEntry()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    try {
      if (editBranch) {
        await updateBranch.mutateAsync({ id: editBranch.id, body: form })
      } else {
        await createBranch.mutateAsync(form)
      }
      setDialogOpen(false)
      setEditBranch(null)
      setForm(emptyBranchForm)
    } catch (err) {
      setError(err.message)
    }
  }

  const handleEdit = (branch) => {
    setEditBranch(branch)
    setForm({
      name: branch.name || '',
      contact_name: branch.contact_name || '',
      email: branch.email || '',
      phone: branch.phone || '',
      mobile: branch.mobile || '',
      address: branch.address || '',
      whatsapp_phone: branch.whatsapp_phone || '',
    })
    setDialogOpen(true)
  }

  const handleDelete = async (id) => {
    try { await deleteBranch.mutateAsync(id) } catch (err) { setError(err.message) }
  }

  const toggleDispatch = async (branch) => {
    try {
      await updateBranch.mutateAsync({ id: branch.id, body: { dispatch_enabled: !branch.dispatch_enabled } })
    } catch (err) { setError(err.message) }
  }

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

  if (isLoading) return <div className="text-muted-foreground">{t('common.loading')}</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <p className="text-sm text-muted-foreground mt-1">{t('branches.subtitle')}</p>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { setEditBranch(null); setForm(emptyBranchForm) } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editBranch ? t('common.edit') : t('branches.dialogTitle')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>{t('branches.name')}</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{t('branches.contactName')}</Label>
                <Input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t('common.email')}</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{t('branches.phone')}</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t('branches.mobile')}</Label>
                <Input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t('branches.address')}</Label>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>{t('branches.whatsappPhone')}</Label>
              <Input value={form.whatsapp_phone} onChange={(e) => setForm({ ...form, whatsapp_phone: e.target.value })} placeholder="+972..." />
            </div>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>{t('common.cancel')}</Button>
              <Button type="submit">{editBranch ? t('common.save') : t('common.create')}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {error && (
        <div className="p-3 mb-4 text-sm rounded-md bg-destructive/10 text-destructive border border-destructive/20">{error}</div>
      )}

      <Tabs defaultValue="branches">
        <TabsList>
          <TabsTrigger value="branches" className="gap-1.5">
            <Building2 size={14} />
            {t('branches.title')} ({branches.length})
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

        <TabsContent value="branches" className="mt-4">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('branches.name')}</TableHead>
                  <TableHead>{t('branches.contactName')}</TableHead>
                  <TableHead>{t('branches.phone')}</TableHead>
                  <TableHead>{t('branches.address')}</TableHead>
                  <TableHead>{t('branches.whatsappPhone')}</TableHead>
                  <TableHead>{t('branches.dispatch')}</TableHead>
                  <TableHead>{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {branches.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-6">{t('branches.empty')}</TableCell>
                  </TableRow>
                ) : branches.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">
                      <span className="inline-flex items-center gap-1.5">
                        <Home size={14} className="text-muted-foreground shrink-0" />
                        {b.name}
                      </span>
                    </TableCell>
                    <TableCell>
                      {b.contact_name ? (
                        <span className="inline-flex items-center gap-2">
                          <span className={`${nameColor(b.contact_name)} text-white shrink-0 size-6 rounded-full flex items-center justify-center text-xs font-medium`}>
                            {b.contact_name.charAt(0).toUpperCase()}
                          </span>
                          {b.contact_name}
                        </span>
                      ) : '-'}
                    </TableCell>
                    <TableCell>{b.phone || b.mobile || '-'}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{b.address || '-'}</TableCell>
                    <TableCell>
                      {b.whatsapp_phone ? (
                        <Badge variant="secondary" className="text-xs">{b.whatsapp_phone}</Badge>
                      ) : '-'}
                    </TableCell>
                    <TableCell>
                      <Switch size="sm" checked={!!b.dispatch_enabled} onCheckedChange={() => toggleDispatch(b)} />
                    </TableCell>
                    <TableCell className="flex gap-2">
                      <Button size="sm" variant="ghost" onClick={() => handleEdit(b)}>{t('common.edit')}</Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="ghost" className="text-destructive">{t('common.delete')}</Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{t('branches.deleteTitle')}</AlertDialogTitle>
                            <AlertDialogDescription>{t('common.irreversible')}</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                            <AlertDialogAction variant="destructive" onClick={() => handleDelete(b.id)}>{t('common.delete')}</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
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

      {actionsContainer && createPortal(
        <Button onClick={() => setDialogOpen(true)}>{t('common.new')}</Button>,
        actionsContainer
      )}
    </div>
  )
}

// ─── Dispatch Configuration Tab ──────────────────────────
function DispatchConfigTab({ t }) {
  const { data: config, isLoading, refetch } = useDispatchConfig()
  const updateConfig = useUpdateDispatchConfig()
  const connectWhatsApp = useConnectDispatchWhatsApp()
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
      const data = await connectWhatsApp.mutateAsync()
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

  const dispatchInbox = config?.inboxes

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
              <Button size="sm" variant={dispatchInbox ? 'outline' : 'default'} onClick={handleConnectWhatsApp} disabled={connectWhatsApp.isPending}>
                {connectWhatsApp.isPending ? <Loader2 size={14} className="animate-spin" /> : <MessageCircle size={14} />}
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
