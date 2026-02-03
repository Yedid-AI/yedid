import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useInbox, useAgents, useSessions, useAssignAgent, useDeleteInbox } from '../hooks/queries'
import { useI18n } from '../lib/i18n'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { ArrowLeft, Info, MessageSquare, Trash2 } from 'lucide-react'

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

  const sessions = sessionData?.sessions || []
  const isLoading = inboxLoading || agentsLoading || sessionsLoading

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

  if (isLoading) return <div className="text-muted-foreground">{t('common.loading')}</div>
  if (error) return (
    <div>
      <Button variant="ghost" onClick={() => navigate('/inboxes')} className="mb-4">
        <ArrowLeft className="me-2 h-4 w-4 icon-directional" /> {t('common.back')}
      </Button>
      <div className="p-3 text-sm rounded-md bg-destructive/10 text-destructive border border-destructive/20">{error}</div>
    </div>
  )

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

      <Tabs defaultValue="info">
        <TabsList>
          <TabsTrigger value="info"><Info className="me-1.5 h-4 w-4" />{t('inboxes.info')}</TabsTrigger>
          <TabsTrigger value="sessions"><MessageSquare className="me-1.5 h-4 w-4" />{t('inboxes.sessions')}</TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="mt-6 space-y-6">
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
