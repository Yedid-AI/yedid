import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useInbox, useAgents, useSessions, useAssignAgent, useDeleteInbox, useInboxChatwoot, useUpdateInbox, useUploadInboxAvatar, useChatwootAgents, useInboxMembers, useUpdateInboxMembers, useUpdateInboxAiSettings, useWhatsAppStatus, useWhatsAppReconnect } from '../hooks/queries'
import { useI18n } from '../lib/i18n'
import { usePageTitle } from '../lib/page-header'
import { useTheme } from '../lib/theme'
import { localeConfig } from '../locales/index.js'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { api } from '../lib/api'
import { Switch } from '@/components/ui/switch'
import ScheduleGrid from '@/components/inbox/ScheduleGrid'
import { ArrowLeft, Info, MessageSquare, Trash2, Upload, Palette, Users, ImageIcon, RefreshCw, Globe, Copy, Check, ExternalLink, Bot, Wifi, WifiOff, Loader2, Phone } from 'lucide-react'

const COMMON_TIMEZONES = [
  'UTC',
  'Asia/Jerusalem', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Shanghai', 'Asia/Tokyo', 'Asia/Singapore', 'Asia/Hong_Kong',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Madrid', 'Europe/Rome', 'Europe/Moscow', 'Europe/Istanbul',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Toronto', 'America/Sao_Paulo', 'America/Mexico_City',
  'Australia/Sydney', 'Australia/Melbourne',
  'Pacific/Auckland',
  'Africa/Johannesburg', 'Africa/Cairo',
]

export default function InboxDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const { t, locale: appLocale, dateLocale } = useI18n()
  const { dark } = useTheme()

  const { data: inbox, isLoading: inboxLoading } = useInbox(id)
  usePageTitle(inbox?.name || '')

  const { data: agents = [], isLoading: agentsLoading } = useAgents()
  const { data: sessionData, isLoading: sessionsLoading } = useSessions({ inbox_id: id })
  const assignAgent = useAssignAgent()
  const deleteInbox = useDeleteInbox()

  // Chatwoot widget settings (source of truth)
  const isWebChannel = inbox?.channel_type !== 'whatsapp'
  const isWhatsApp = inbox?.channel_type === 'whatsapp'
  const { data: chatwootData, isLoading: chatwootLoading } = useInboxChatwoot(isWebChannel ? id : null)

  // WhatsApp connection status
  const { data: waStatus, isLoading: waStatusLoading, dataUpdatedAt: waCheckedAt, refetch: refetchWaStatus } = useWhatsAppStatus(isWhatsApp ? id : null)
  const waReconnect = useWhatsAppReconnect()
  const updateInbox = useUpdateInbox()
  const uploadAvatar = useUploadInboxAvatar()

  // Agent attribution
  const { data: chatwootAgents = [] } = useChatwootAgents()
  const { data: inboxMembers = [] } = useInboxMembers(id)
  const updateMembers = useUpdateInboxMembers()

  // Widget settings form state
  const [widgetForm, setWidgetForm] = useState({
    name: '',
    website_url: '',
    welcome_title: '',
    welcome_tagline: '',
    widget_color: '#2383E2',
  })
  const [widgetSaved, setWidgetSaved] = useState(false)
  const [previewKey, setPreviewKey] = useState(0)
  const avatarInputRef = useRef(null)

  // Widget locale state (defaults to app language)
  const [widgetLocale, setWidgetLocale] = useState(appLocale)

  // Token copy state
  const [copied, setCopied] = useState(false)

  // Members state
  const [selectedMembers, setSelectedMembers] = useState([])
  const [membersSaved, setMembersSaved] = useState(false)

  // AI availability state
  const updateAiSettings = useUpdateInboxAiSettings()
  const [aiSchedule, setAiSchedule] = useState(null)
  const [aiTimezone, setAiTimezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone)
  const [aiSettingsSaved, setAiSettingsSaved] = useState(false)

  // Initialize widget form from Chatwoot data
  useEffect(() => {
    if (chatwootData) {
      setWidgetForm({
        name: chatwootData.name || '',
        website_url: chatwootData.website_url || '',
        welcome_title: chatwootData.welcome_title || '',
        welcome_tagline: chatwootData.welcome_tagline || '',
        widget_color: chatwootData.widget_color || '#2383E2',
      })
    }
  }, [chatwootData])

  // Initialize widget locale from inbox data (or fallback to app language)
  useEffect(() => {
    if (inbox?.widget_locale) {
      setWidgetLocale(inbox.widget_locale)
    }
  }, [inbox?.widget_locale])

  // Initialize members from inbox members data
  useEffect(() => {
    if (inboxMembers.length > 0) {
      setSelectedMembers(inboxMembers.map((m) => m.id))
    }
  }, [inboxMembers])

  // Initialize AI settings from inbox data
  useEffect(() => {
    if (inbox) {
      setAiSchedule(inbox.ai_schedule ?? null)
      setAiTimezone(inbox.ai_timezone || Intl.DateTimeFormat().resolvedOptions().timeZone)
    }
  }, [inbox?.ai_schedule, inbox?.ai_timezone])

  const sessions = sessionData?.sessions || []
  const isLoading = inboxLoading || agentsLoading || sessionsLoading

  // Build preview HTML using Chatwoot SDK (prevents auto-close that happens with raw widget URL)
  // darkMode + locale must be set via window.chatwootSettings BEFORE chatwootSDK.run()
  const widgetPreviewSrc = inbox?.website_token ? `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: transparent; overflow: hidden; }
  .woot-widget-holder {
    position: fixed !important; inset: 0 !important;
    width: 100% !important; height: 100% !important;
    max-height: 100% !important; border-radius: 0 !important;
    box-shadow: none !important;
  }
  .woot-widget-holder iframe {
    border-radius: 0 !important;
    color-scheme: ${dark ? 'dark' : 'light'};
  }
  .woot--bubble-holder { display: none !important; }
</style>
</head>
<body>
<script>
  window.chatwootSettings = {
    hideMessageBubble: true,
    position: "right",
    locale: "${widgetLocale}",
    type: "standard",
    darkMode: "${dark ? 'dark' : 'light'}"
  };
  (function(d, t) {
    var g = d.createElement(t);
    g.src = "https://chat.yedid.io/packs/js/sdk.js";
    g.async = true;
    d.body.appendChild(g);
    g.onload = function() {
      window.chatwootSDK.run({
        websiteToken: "${inbox.website_token}",
        baseUrl: "https://chat.yedid.io"
      });
    };
  })(document, "script");
  window.addEventListener("chatwoot:ready", function() {
    window.$chatwoot.toggle("open");
    window.$chatwoot.setCustomAttributes({ yedid_preview: "true" });
  });
</script>
</body>
</html>` : null

  const handleAssignAgent = async (agentBotId) => {
    try {
      await assignAgent.mutateAsync({ inboxId: id, agentBotId })
    } catch (err) {
      setError(err.message)
    }
  }

  const handleDelete = async () => {
    try {
      await deleteInbox.mutateAsync(id)
      navigate('/inboxes')
    } catch (err) {
      setError(err.message)
    }
  }

  const handleSaveWidget = async (e) => {
    e.preventDefault()
    setError('')
    setWidgetSaved(false)
    try {
      await updateInbox.mutateAsync({ id, body: { ...widgetForm, widget_locale: widgetLocale } })
      setWidgetSaved(true)
      setTimeout(() => { setWidgetSaved(false); setPreviewKey((k) => k + 1) }, 1500)
    } catch (err) {
      setError(err.message)
    }
  }

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    try {
      await uploadAvatar.mutateAsync({ id, file })
      setTimeout(() => setPreviewKey((k) => k + 1), 1500)
    } catch (err) {
      setError(err.message)
    }
  }

  const handleSaveMembers = async () => {
    setError('')
    setMembersSaved(false)
    try {
      await updateMembers.mutateAsync({ id, user_ids: selectedMembers })
      setMembersSaved(true)
      setTimeout(() => setMembersSaved(false), 2000)
    } catch (err) {
      setError(err.message)
    }
  }

  const toggleMember = (agentId) => {
    setSelectedMembers((prev) =>
      prev.includes(agentId) ? prev.filter((id) => id !== agentId) : [...prev, agentId]
    )
  }

  const handleCopyToken = () => {
    navigator.clipboard.writeText(inbox.website_token)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleSSO = async () => {
    try {
      const res = await api.get('/chatwoot-sso')
      if (res.url) window.open(res.url, '_blank')
    } catch (err) {
      setError(err.message)
    }
  }

  const handleAiToggle = async (checked) => {
    try {
      await updateAiSettings.mutateAsync({ id, body: { ai_enabled: checked } })
    } catch (err) {
      setError(err.message)
    }
  }

  const handleSaveAiSettings = async () => {
    setError('')
    setAiSettingsSaved(false)
    try {
      await updateAiSettings.mutateAsync({
        id,
        body: { ai_schedule: aiSchedule, ai_timezone: aiTimezone },
      })
      setAiSettingsSaved(true)
      setTimeout(() => setAiSettingsSaved(false), 2000)
    } catch (err) {
      setError(err.message)
    }
  }

  const handleWhatsAppReconnect = async () => {
    setError('')
    try {
      const res = await waReconnect.mutateAsync(id)
      if (res.url) {
        const popup = window.open(res.url, 'whatsapp_reconnect', 'width=480,height=720')
        // Refetch status when popup closes
        const timer = setInterval(() => {
          if (!popup || popup.closed) {
            clearInterval(timer)
            refetchWaStatus()
          }
        }, 1000)
      }
    } catch (err) {
      setError(err.message)
    }
  }

  const HEALTHY_STATUSES = ['OK', 'CREATION_SUCCESS', 'RECONNECTED', 'SYNC_SUCCESS']
  const PENDING_STATUSES = ['CONNECTING']
  const waIsHealthy = waStatus && HEALTHY_STATUSES.includes(waStatus.status)
  const waIsPending = waStatus && PENDING_STATUSES.includes(waStatus.status)

  if (isLoading) return <div className="text-muted-foreground">{t('common.loading')}</div>

  return (
    <div>
      {error && (
        <div className="p-3 mb-4 text-sm rounded-md bg-destructive/10 text-destructive border border-destructive/20">{error}</div>
      )}

      <Tabs defaultValue="info">
        {/* Header Card */}
        <Card className="mb-6">
          {/* Line 1: Back + Name/Date + CTA */}
          <div className="flex items-center justify-between px-5 pt-4 pb-3">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => navigate('/inboxes')}>
                <ArrowLeft className="me-2 h-4 w-4 icon-directional" /> {t('common.back')}
              </Button>
              <div className="w-px h-5 bg-border" />
              <div>
                <h1 className="text-base font-semibold tracking-tight">{inbox.name || 'Inbox'}</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {t('common.createdAt')} {new Date(inbox.created_at).toLocaleDateString(dateLocale)}
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleSSO}>
              <ExternalLink size={14} />
              {t('inboxes.openInbox')}
            </Button>
          </div>

          {/* Line 2: Tabs left + Metadata right */}
          <div className="flex items-center justify-between px-5 pb-3 border-t pt-3">
            <TabsList>
              <TabsTrigger value="info"><Info className="me-1.5 h-4 w-4" />{t('inboxes.info')}</TabsTrigger>
              <TabsTrigger value="sessions"><MessageSquare className="me-1.5 h-4 w-4" />{t('inboxes.sessions')}</TabsTrigger>
            </TabsList>

            <div className="flex items-center gap-5 text-sm">
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">Inbox</span>
                <span className="font-medium">{inbox.inbox_id}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">Account</span>
                <span className="font-medium">{inbox.chatwoot_account_id}</span>
              </div>
              {inbox.website_token && (
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">Token</span>
                  <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded select-all">{inbox.website_token}</code>
                  <button
                    type="button"
                    onClick={handleCopyToken}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                  </button>
                </div>
              )}
            </div>
          </div>
        </Card>

        <TabsContent value="info" className="space-y-6">

          {/* WhatsApp Connection Status */}
          {isWhatsApp && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Phone size={16} />
                  {t('inboxes.whatsappConnection')}
                </CardTitle>
                <CardDescription>{t('inboxes.whatsappConnectionDesc')}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {inbox.phone_number && (
                      <span className="text-sm font-mono font-medium">{inbox.phone_number}</span>
                    )}
                    {waStatusLoading ? (
                      <Badge variant="outline" className="gap-1.5">
                        <Loader2 size={12} className="animate-spin" />
                        {t('common.loading')}
                      </Badge>
                    ) : waIsHealthy ? (
                      <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 gap-1.5">
                        <Wifi size={12} />
                        {t('inboxes.whatsappConnected')}
                      </Badge>
                    ) : waIsPending ? (
                      <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 gap-1.5">
                        <Loader2 size={12} className="animate-spin" />
                        {t('inboxes.whatsappConnecting')}
                      </Badge>
                    ) : (
                      <Badge className="bg-destructive/10 text-destructive border-destructive/20 gap-1.5">
                        <WifiOff size={12} />
                        {waStatus?.status === 'DELETED' ? t('inboxes.whatsappDisconnected') : t('inboxes.whatsappError')}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {waStatus && !waIsHealthy && !waIsPending && (
                      <Button
                        variant="default"
                        size="sm"
                        className="gap-1.5"
                        onClick={handleWhatsAppReconnect}
                        disabled={waReconnect.isPending}
                      >
                        <WifiOff size={14} />
                        {waReconnect.isPending ? t('inboxes.whatsappConnecting') : t('inboxes.whatsappReconnect')}
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => refetchWaStatus()}
                      disabled={waStatusLoading}
                    >
                      <RefreshCw size={14} className={waStatusLoading ? 'animate-spin' : ''} />
                      {t('inboxes.whatsappCheckStatus')}
                    </Button>
                  </div>
                </div>
                {waCheckedAt > 0 && (
                  <p className="text-xs text-muted-foreground mt-3">
                    {t('inboxes.whatsappLastChecked')} {new Date(waCheckedAt).toLocaleTimeString()}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Widget Settings + Preview (web channel only) */}
          {isWebChannel && (
            <Card className="bg-transparent border-0 !shadow-none">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Palette size={16} />
                  {t('inboxes.widgetSettings')}
                </CardTitle>
                <CardDescription>{t('inboxes.widgetSettingsDesc')}</CardDescription>
              </CardHeader>
              <CardContent>
                {chatwootLoading ? (
                  <div className="text-sm text-muted-foreground">{t('common.loading')}</div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Left: Settings Form */}
                    <form onSubmit={handleSaveWidget} className="space-y-5">
                      {/* Avatar */}
                      <div className="space-y-2">
                        <Label>{t('inboxes.avatar')}</Label>
                        <div className="flex items-center gap-3">
                          {chatwootData?.avatar_url ? (
                            <img
                              src={chatwootData.avatar_url}
                              alt="Avatar"
                              className="w-12 h-12 rounded-full object-cover border"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center border">
                              <ImageIcon size={18} className="text-muted-foreground" />
                            </div>
                          )}
                          <input
                            ref={avatarInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleAvatarUpload}
                            className="hidden"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-1.5"
                            onClick={() => avatarInputRef.current?.click()}
                            disabled={uploadAvatar.isPending}
                          >
                            <Upload size={14} />
                            {uploadAvatar.isPending ? t('common.saving') : t('inboxes.uploadAvatar')}
                          </Button>
                        </div>
                      </div>

                      {/* Website Name */}
                      <div className="space-y-2">
                        <Label>{t('inboxes.websiteName')}</Label>
                        <Input
                          value={widgetForm.name}
                          onChange={(e) => setWidgetForm({ ...widgetForm, name: e.target.value })}
                          placeholder={t('inboxes.namePlaceholder')}
                        />
                      </div>

                      {/* Welcome Heading */}
                      <div className="space-y-2">
                        <Label>{t('inboxes.welcomeTitle')}</Label>
                        <Input
                          value={widgetForm.welcome_title}
                          onChange={(e) => setWidgetForm({ ...widgetForm, welcome_title: e.target.value })}
                          placeholder={t('inboxes.welcomeTitlePlaceholder')}
                        />
                      </div>

                      {/* Welcome Tagline */}
                      <div className="space-y-2">
                        <Label>{t('inboxes.welcomeTagline')}</Label>
                        <Input
                          value={widgetForm.welcome_tagline}
                          onChange={(e) => setWidgetForm({ ...widgetForm, welcome_tagline: e.target.value })}
                          placeholder={t('inboxes.welcomeTaglinePlaceholder')}
                        />
                      </div>

                      {/* Website Domain */}
                      <div className="space-y-2">
                        <Label>{t('inboxes.websiteDomain')}</Label>
                        <Input
                          value={widgetForm.website_url}
                          onChange={(e) => setWidgetForm({ ...widgetForm, website_url: e.target.value })}
                          placeholder="https://monsite.com"
                        />
                      </div>

                      {/* Widget Color */}
                      <div className="space-y-2">
                        <Label>{t('inboxes.widgetColor')}</Label>
                        <div className="flex items-center gap-3">
                          <input
                            type="color"
                            value={widgetForm.widget_color}
                            onChange={(e) => setWidgetForm({ ...widgetForm, widget_color: e.target.value })}
                            className="w-9 h-9 rounded-md border cursor-pointer p-0.5"
                          />
                          <Input
                            value={widgetForm.widget_color}
                            onChange={(e) => setWidgetForm({ ...widgetForm, widget_color: e.target.value })}
                            className="w-[100px] font-mono text-sm"
                            maxLength={7}
                          />
                        </div>
                      </div>

                      {/* Widget Language */}
                      <div className="space-y-2">
                        <Label className="flex items-center gap-1.5">
                          <Globe size={14} />
                          {t('inboxes.widgetLocale')}
                        </Label>
                        <Select value={widgetLocale} onValueChange={setWidgetLocale}>
                          <SelectTrigger className="w-[200px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(localeConfig).map(([code, cfg]) => (
                              <SelectItem key={code} value={code}>{cfg.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        <Button type="submit" disabled={updateInbox.isPending}>
                          {updateInbox.isPending ? t('common.saving') : t('common.save')}
                        </Button>
                        {widgetSaved && (
                          <span className="text-sm text-emerald-600">{t('common.saved')}</span>
                        )}
                      </div>
                    </form>

                    {/* Right: Live Widget Preview (real Chatwoot widget) */}
                    {inbox.website_token && (
                      <div className="flex flex-col items-center">
                        <div className="flex items-center gap-2 mb-3">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Preview</p>
                          <button
                            type="button"
                            onClick={() => setPreviewKey((k) => k + 1)}
                            className="text-muted-foreground hover:text-foreground transition-colors"
                            title="Refresh"
                          >
                            <RefreshCw size={12} />
                          </button>
                        </div>
                        <div className="w-[370px] h-[550px] rounded-2xl overflow-hidden shadow-soft-lg border">
                          <iframe
                            key={previewKey}
                            srcdoc={widgetPreviewSrc}
                            className="w-full h-full border-0"
                            title="Widget preview"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Agent Attribution (inbox members) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Users size={16} />
                {t('inboxes.agentAttribution')}
              </CardTitle>
              <CardDescription>{t('inboxes.agentAttributionDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              {chatwootAgents.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('inboxes.noAgentsAvailable')}</p>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    {chatwootAgents.map((agent) => (
                      <label
                        key={agent.id}
                        className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 cursor-pointer"
                      >
                        <Checkbox
                          checked={selectedMembers.includes(agent.id)}
                          onCheckedChange={() => toggleMember(agent.id)}
                        />
                        {agent.avatar_url ? (
                          <img src={agent.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover" />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                            {(agent.name || agent.email || '?')[0].toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{agent.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{agent.email}</p>
                        </div>
                        {agent.availability_status && (
                          <span className={`ms-auto text-xs ${agent.availability_status === 'online' ? 'text-emerald-500' : 'text-muted-foreground'}`}>
                            {agent.availability_status}
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      onClick={handleSaveMembers}
                      disabled={updateMembers.isPending}
                    >
                      {updateMembers.isPending ? t('common.saving') : t('common.save')}
                    </Button>
                    {membersSaved && (
                      <span className="text-sm text-emerald-600">{t('common.saved')}</span>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Assigned AI Agent Bot + Toggle */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Bot size={16} />
                    {t('inboxes.assignedAgent')}
                  </CardTitle>
                  <CardDescription>{t('inboxes.chooseAgent')}</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="ai-toggle" className="text-sm">
                    {inbox.ai_enabled !== false ? t('common.active') : t('common.inactive')}
                  </Label>
                  <Switch
                    id="ai-toggle"
                    checked={inbox.ai_enabled !== false}
                    onCheckedChange={handleAiToggle}
                    disabled={updateAiSettings.isPending}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {/* No agent option */}
                <button
                  type="button"
                  onClick={() => handleAssignAgent('none')}
                  className={`flex items-center gap-3 p-3 rounded-lg border-2 text-start transition-colors ${
                    !inbox.agent_bot_id
                      ? 'border-primary bg-primary/5'
                      : 'border-transparent bg-muted/50 hover:bg-muted'
                  }`}
                >
                  <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <Bot size={16} className="text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{t('inboxes.noAgent')}</p>
                    <p className="text-xs text-muted-foreground">{t('inboxes.noAgentDesc')}</p>
                  </div>
                </button>

                {/* Agent options */}
                {agents.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => handleAssignAgent(String(a.id))}
                    className={`flex items-center gap-3 p-3 rounded-lg border-2 text-start transition-colors ${
                      inbox.agent_bot_id === a.id
                        ? 'border-primary bg-primary/5'
                        : 'border-transparent bg-muted/50 hover:bg-muted'
                    }`}
                  >
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary shrink-0">
                      {(a.name || '?')[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{a.name}</p>
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* AI Availability (schedule) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('inboxes.aiAvailability')}</CardTitle>
              <CardDescription>{t('inboxes.aiAvailabilityDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              {/* Timezone */}
              <div className="flex items-center gap-3 mb-4">
                <Label className="text-sm shrink-0">{t('inboxes.timezone')}</Label>
                <Select value={aiTimezone} onValueChange={setAiTimezone} disabled={inbox.ai_enabled === false}>
                  <SelectTrigger className="w-[260px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COMMON_TIMEZONES.map(tz => (
                      <SelectItem key={tz} value={tz}>{tz.replace(/_/g, ' ')}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Schedule grid */}
              <ScheduleGrid
                schedule={aiSchedule}
                onChange={setAiSchedule}
                disabled={inbox.ai_enabled === false}
              />

              {/* Save */}
              <div className="flex items-center gap-2 mt-4">
                <Button
                  onClick={handleSaveAiSettings}
                  disabled={updateAiSettings.isPending || inbox.ai_enabled === false}
                >
                  {updateAiSettings.isPending ? t('common.saving') : t('common.save')}
                </Button>
                {aiSettingsSaved && (
                  <span className="text-sm text-emerald-600">{t('common.saved')}</span>
                )}
                <span className="text-xs text-muted-foreground ms-auto">
                  {aiSchedule === null ? t('inboxes.scheduleAlwaysActive') : t('inboxes.scheduleCustom')}
                </span>
              </div>
            </CardContent>
          </Card>


          {/* Widget Embed */}
          {inbox.website_token && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('inboxes.widgetEmbed')}</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="p-3 bg-muted rounded-md text-xs font-mono overflow-x-auto">
{`<script>
  window.chatwootSettings = {
    hideMessageBubble: false,
    position: "right",
    locale: "${widgetLocale}",
    type: "standard",
    darkMode: "auto"
  };
  (function(d,t) {
    var BASE_URL="https://chat.yedid.io";
    var g=d.createElement(t),s=d.getElementsByTagName(t)[0];
    g.src=BASE_URL+"/packs/js/sdk.js";
    g.defer = true;
    g.async = true;
    s.parentNode.insertBefore(g,s);
    g.onload=function(){
      window.chatwootSDK.run({
        websiteToken: '${inbox.website_token}',
        baseUrl: BASE_URL
      })
    }
  })(document,"script");
</script>`}
                </pre>
              </CardContent>
            </Card>
          )}

          {/* Delete */}
          <Card className="border-destructive/30">
            <CardHeader>
              <CardTitle className="text-base text-destructive">{t('inboxes.deleteTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-3">{t('common.irreversible')}</p>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" className="gap-1.5">
                    <Trash2 size={14} />
                    {t('common.delete')}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t('inboxes.deleteTitle')}</AlertDialogTitle>
                    <AlertDialogDescription>{t('common.irreversible')}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                    <AlertDialogAction variant="destructive" onClick={handleDelete}>{t('common.delete')}</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sessions" className="mt-6">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>{t('common.status')}</TableHead>
                  <TableHead>{t('inboxes.billable')}</TableHead>
                  <TableHead>{t('common.createdAt')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                      {t('inboxes.noSession')}
                    </TableCell>
                  </TableRow>
                ) : (
                  sessions.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-sm">{s.id}</TableCell>
                      <TableCell>
                        <Badge variant={s.status === 'open' ? 'default' : 'secondary'}>
                          {s.status === 'open' ? t('inboxes.sessionOpen') : t('inboxes.sessionClosed')}
                        </Badge>
                      </TableCell>
                      <TableCell>{s.billable ? t('common.yes') : t('common.no')}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(s.created_at).toLocaleString(dateLocale)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
