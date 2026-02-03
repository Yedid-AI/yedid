import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useInbox, useAgents, useSessions, useAssignAgent, useDeleteInbox, useInboxChatwoot, useUpdateInbox, useUploadInboxAvatar, useChatwootAgents, useInboxMembers, useUpdateInboxMembers } from '../hooks/queries'
import { useI18n } from '../lib/i18n'
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
import { ArrowLeft, Info, MessageSquare, Trash2, Upload, Palette, Users, ImageIcon, RefreshCw } from 'lucide-react'

export default function InboxDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const { t, dateLocale } = useI18n()

  const { data: inbox, isLoading: inboxLoading } = useInbox(id)
  const { data: agents = [], isLoading: agentsLoading } = useAgents()
  const { data: sessionData, isLoading: sessionsLoading } = useSessions({ inbox_id: id })
  const assignAgent = useAssignAgent()
  const deleteInbox = useDeleteInbox()

  // Chatwoot widget settings (source of truth)
  const isWebChannel = inbox?.channel_type !== 'whatsapp'
  const { data: chatwootData, isLoading: chatwootLoading } = useInboxChatwoot(isWebChannel ? id : null)
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

  // Members state
  const [selectedMembers, setSelectedMembers] = useState([])
  const [membersSaved, setMembersSaved] = useState(false)

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

  // Initialize members from inbox members data
  useEffect(() => {
    if (inboxMembers.length > 0) {
      setSelectedMembers(inboxMembers.map((m) => m.id))
    }
  }, [inboxMembers])

  const sessions = sessionData?.sessions || []
  const isLoading = inboxLoading || agentsLoading || sessionsLoading

  // Build preview HTML using Chatwoot SDK (prevents auto-close that happens with raw widget URL)
  const widgetPreviewSrc = inbox?.website_token ? `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #f5f5f5; overflow: hidden; }
  .woot-widget-holder {
    position: fixed !important; inset: 0 !important;
    width: 100% !important; height: 100% !important;
    max-height: 100% !important; border-radius: 0 !important;
    box-shadow: none !important;
  }
  .woot-widget-holder iframe { border-radius: 0 !important; }
  .woot--bubble-holder { display: none !important; }
</style>
</head>
<body>
<script>
  (function(d, t) {
    var g = d.createElement(t);
    g.src = "https://chat.cardynal.io/packs/js/sdk.js";
    g.async = true;
    d.body.appendChild(g);
    g.onload = function() {
      window.chatwootSDK.run({
        websiteToken: "${inbox.website_token}",
        baseUrl: "https://chat.cardynal.io"
      });
    };
  })(document, "script");
  window.addEventListener("chatwoot:ready", function() {
    window.$chatwoot.toggle("open");
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
      await updateInbox.mutateAsync({ id, body: widgetForm })
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

  if (isLoading) return <div className="text-muted-foreground">{t('common.loading')}</div>

  return (
    <div>
      <div className="flex items-center gap-4 mb-8">
        <Button variant="ghost" size="sm" onClick={() => navigate('/inboxes')}>
          <ArrowLeft className="me-2 h-4 w-4 icon-directional" /> {t('common.back')}
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{inbox.name || 'Inbox'}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t('common.createdAt')} {new Date(inbox.created_at).toLocaleDateString(dateLocale)}
          </p>
        </div>
        {inbox.agent_bots && (
          <Badge variant="default" className="ms-auto">{inbox.agent_bots.name}</Badge>
        )}
      </div>

      {error && (
        <div className="p-3 mb-4 text-sm rounded-md bg-destructive/10 text-destructive border border-destructive/20">{error}</div>
      )}

      <Tabs defaultValue="info">
        <TabsList>
          <TabsTrigger value="info"><Info className="me-1.5 h-4 w-4" />{t('inboxes.info')}</TabsTrigger>
          <TabsTrigger value="sessions"><MessageSquare className="me-1.5 h-4 w-4" />{t('inboxes.sessions')}</TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="mt-6 space-y-6">
          {/* Widget Settings + Preview (web channel only) */}
          {isWebChannel && (
            <Card>
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

          {/* Assigned AI Agent Bot */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('inboxes.assignedAgent')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label>{t('inboxes.chooseAgent')}</Label>
                <Select
                  value={inbox.agent_bot_id ? String(inbox.agent_bot_id) : 'none'}
                  onValueChange={handleAssignAgent}
                >
                  <SelectTrigger className="w-[240px]">
                    <SelectValue placeholder={t('inboxes.noAgent')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('inboxes.noAgent')}</SelectItem>
                    {agents.map((a) => (
                      <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Technical Details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('common.details')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Inbox ID (Chatwoot)</span>
                  <p className="font-medium mt-0.5">{inbox.inbox_id}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Account ID</span>
                  <p className="font-medium mt-0.5">{inbox.chatwoot_account_id}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Website Token</span>
                  <p className="font-mono text-xs mt-0.5">{inbox.website_token || '-'}</p>
                </div>
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
  (function(d,t) {
    var BASE_URL="https://chat.cardynal.io";
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
