import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useInboxes, useCreateInbox, useConnectWhatsApp } from '../hooks/queries'
import { api } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { usePageTitle, usePageHeader } from '../lib/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

import { LayoutGrid, List, Globe, MessageCircle, Instagram, Facebook, Settings, ExternalLink, Sparkles, CircleDot, CheckCircle, Loader2 } from 'lucide-react'

const CHANNEL_ICONS = {
  web: Globe,
  whatsapp: MessageCircle,
  instagram: Instagram,
  meta: Facebook,
}

const CHANNEL_LABELS = {
  web: 'inboxes.channelWeb',
  whatsapp: 'inboxes.channelWhatsapp',
  instagram: 'inboxes.channelInstagram',
  meta: 'inboxes.channelMeta',
}

export default function Inboxes() {
  const [viewMode, setViewMode] = useState('card')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [channelStep, setChannelStep] = useState(null) // null = chooser, 'web' = web form
  const [form, setForm] = useState({ name: '', website_url: '', welcome_title: '', welcome_tagline: '', widget_color: '#2383E2' })
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const { t } = useI18n()
  usePageTitle(t('inboxes.title'))
  const { actionsContainer } = usePageHeader()

  const { data: inboxes = [], isLoading } = useInboxes()
  const createInbox = useCreateInbox()
  const connectWhatsApp = useConnectWhatsApp()

  const resetDialog = () => {
    setChannelStep(null)
    setForm({ name: '', website_url: '', welcome_title: '', welcome_tagline: '', widget_color: '#2383E2' })
    setError('')
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    setError('')
    try {
      await createInbox.mutateAsync(form)
      setDialogOpen(false)
      resetDialog()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleConnectWhatsApp = async () => {
    setError('')
    try {
      const data = await connectWhatsApp.mutateAsync()
      if (data.url) {
        const w = 480, h = 720
        const left = window.screenX + Math.round((window.outerWidth - w) / 2)
        const top = window.screenY + Math.round((window.outerHeight - h) / 2)
        window.open(data.url, 'whatsapp-auth', `width=${w},height=${h},left=${left},top=${top}`)
        setDialogOpen(false)
        resetDialog()
      }
    } catch (err) {
      setError(err.message)
    }
  }

  const handleOpenChatwoot = async () => {
    try {
      const data = await api.get('/chatwoot-sso')
      if (data.url) window.open(data.url, '_blank')
    } catch (err) {
      setError(err.message)
    }
  }

  if (isLoading) return <div className="text-muted-foreground">{t('common.loading')}</div>

  const channelIcon = (type) => {
    const Icon = CHANNEL_ICONS[type] || Globe
    return <Icon size={16} />
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-sm text-muted-foreground mt-1">{t('inboxes.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 border rounded-lg p-0.5">
            <button className={`p-1.5 rounded-md transition-colors ${viewMode === 'card' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'}`} onClick={() => setViewMode('card')}>
              <LayoutGrid size={14} />
            </button>
            <button className={`p-1.5 rounded-md transition-colors ${viewMode === 'table' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'}`} onClick={() => setViewMode('table')}>
              <List size={14} />
            </button>
          </div>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetDialog() }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('inboxes.dialogTitle')}</DialogTitle>
          </DialogHeader>

          {error && (
            <div className="p-3 text-sm rounded-md bg-destructive/10 text-destructive border border-destructive/20">{error}</div>
          )}

          {!channelStep ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{t('inboxes.chooseChannel')}</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  className="flex flex-col items-center gap-2 p-4 rounded-lg border hover:border-primary hover:bg-primary/5 transition-colors"
                  onClick={() => setChannelStep('web')}
                >
                  <Globe size={24} className="text-primary" />
                  <span className="text-sm font-medium">{t('inboxes.channelWeb')}</span>
                  <span className="text-[11px] text-muted-foreground text-center">{t('inboxes.webDescription')}</span>
                </button>
                <button
                  type="button"
                  className="flex flex-col items-center gap-2 p-4 rounded-lg border hover:border-emerald-500 hover:bg-emerald-500/5 transition-colors"
                  onClick={handleConnectWhatsApp}
                  disabled={connectWhatsApp.isPending}
                >
                  {connectWhatsApp.isPending ? (
                    <Loader2 size={24} className="text-emerald-500 animate-spin" />
                  ) : (
                    <MessageCircle size={24} className="text-emerald-500" />
                  )}
                  <span className="text-sm font-medium">WhatsApp</span>
                  <span className="text-[11px] text-muted-foreground text-center">{t('inboxes.whatsappDescription')}</span>
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label>{t('common.name')}</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t('inboxes.namePlaceholder')} required />
              </div>
              <div className="space-y-2">
                <Label>{t('inboxes.websiteUrl')}</Label>
                <Input value={form.website_url} onChange={(e) => setForm({ ...form, website_url: e.target.value })} placeholder={t('inboxes.websiteUrlPlaceholder')} />
              </div>
              <div className="space-y-2">
                <Label>{t('inboxes.welcomeTitle')}</Label>
                <Input value={form.welcome_title} onChange={(e) => setForm({ ...form, welcome_title: e.target.value })} placeholder={t('inboxes.welcomeTitlePlaceholder')} />
              </div>
              <div className="space-y-2">
                <Label>{t('inboxes.welcomeTagline')}</Label>
                <Input value={form.welcome_tagline} onChange={(e) => setForm({ ...form, welcome_tagline: e.target.value })} placeholder={t('inboxes.welcomeTaglinePlaceholder')} />
              </div>
              <div className="space-y-2">
                <Label>{t('inboxes.widgetColor')}</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={form.widget_color}
                    onChange={(e) => setForm({ ...form, widget_color: e.target.value })}
                    className="w-9 h-9 rounded-md border cursor-pointer p-0.5"
                  />
                  <Input
                    value={form.widget_color}
                    onChange={(e) => setForm({ ...form, widget_color: e.target.value })}
                    className="w-[100px] font-mono text-sm"
                    maxLength={7}
                  />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={() => setChannelStep(null)}>{t('common.back')}</Button>
                <Button type="submit" disabled={createInbox.isPending}>{createInbox.isPending ? t('common.saving') : t('common.create')}</Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {error && (
        <div className="p-3 mb-4 text-sm rounded-md bg-destructive/10 text-destructive border border-destructive/20">{error}</div>
      )}

      {viewMode === 'card' ? (
        inboxes.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">{t('inboxes.empty')}</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {inboxes.map((inbox) => {
              const ChannelIcon = CHANNEL_ICONS[inbox.channel_type] || Globe
              return (
                <Card key={inbox.id} className="hover:shadow-soft-md transition-all py-0 gap-0">
                  <div className="p-[15px]">
                    <div className="flex items-center gap-2.5 mb-2">
                      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 text-primary shrink-0">
                        <ChannelIcon size={16} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-sm truncate leading-tight">{inbox.name || '-'}</h3>
                        <span className="text-[11px] text-muted-foreground">{t(CHANNEL_LABELS[inbox.channel_type] || 'inboxes.channelWeb')}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground mb-2.5">
                      <span className="flex items-center gap-1">
                        <Sparkles size={11} />
                        <span className={inbox.agent_bots?.name ? 'text-foreground' : ''}>{inbox.agent_bots?.name || t('inboxes.noAgent')}</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <CircleDot size={11} className="text-primary" />
                        <span className="font-medium text-foreground">{inbox.session_count ?? 0}</span>
                        {t('inboxes.sessionCount')}
                      </span>
                      <span className="flex items-center gap-1">
                        <CheckCircle size={11} className="text-emerald-500" />
                        <span className="font-medium text-foreground">{inbox.resolved_count ?? 0}</span>
                        {t('inboxes.resolvedCount')}
                      </span>
                    </div>

                    <div className="flex items-center justify-end gap-1 border-t pt-2 -mx-1">
                      <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => navigate(`/inboxes/${inbox.id}`)}>
                        <Settings size={12} />
                        {t('common.configure')}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={handleOpenChatwoot}>
                        <ExternalLink size={12} />
                        {t('inboxes.openInbox')}
                      </Button>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        )
      ) : (
        <Card>
          <Table className="[&_th:first-child]:pl-3 [&_td:first-child]:pl-3">
            <TableHeader>
              <TableRow>
                <TableHead>{t('common.name')}</TableHead>
                <TableHead>{t('inboxes.channel')}</TableHead>
                <TableHead>{t('inboxes.sessionCount')}</TableHead>
                <TableHead>{t('inboxes.resolvedCount')}</TableHead>
                <TableHead>{t('inboxes.agent')}</TableHead>
                <TableHead>{t('common.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {inboxes.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">{t('inboxes.empty')}</TableCell></TableRow>
              ) : (
                inboxes.map((inbox) => (
                  <TableRow key={inbox.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center justify-center w-7 h-7 rounded-md bg-primary/10 text-primary shrink-0">
                          {channelIcon(inbox.channel_type)}
                        </div>
                        <span className="font-medium">{inbox.name || '-'}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{t(CHANNEL_LABELS[inbox.channel_type] || 'inboxes.channelWeb')}</Badge>
                    </TableCell>
                    <TableCell>{inbox.session_count ?? 0}</TableCell>
                    <TableCell>{inbox.resolved_count ?? 0}</TableCell>
                    <TableCell className="text-muted-foreground">{inbox.agent_bots?.name || '-'}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => navigate(`/inboxes/${inbox.id}`)}>
                          <Settings size={12} />
                          {t('common.configure')}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={handleOpenChatwoot}>
                          <ExternalLink size={12} />
                          {t('inboxes.openInbox')}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      )}

      {actionsContainer && createPortal(
        <Button onClick={() => setDialogOpen(true)}>{t('inboxes.newInbox')}</Button>,
        actionsContainer
      )}
    </div>
  )
}
