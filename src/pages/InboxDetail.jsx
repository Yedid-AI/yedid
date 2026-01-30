import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { ArrowLeft, Info, MessageSquare } from 'lucide-react'

export default function InboxDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [inbox, setInbox] = useState(null)
  const [agents, setAgents] = useState([])
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [inboxData, agentData, sessionData] = await Promise.all([
          api.get(`/inboxes/${id}`),
          api.get('/agent-bots'),
          api.get(`/sessions?inbox_id=${id}`),
        ])
        setInbox(inboxData.inbox)
        setAgents(agentData.agent_bots)
        setSessions(sessionData.sessions)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [id])

  const handleAssignAgent = async (agentBotId) => {
    try {
      const data = await api.put(`/inboxes/${id}/assign-agent`, {
        agent_bot_id: agentBotId === 'none' ? null : parseInt(agentBotId),
      })
      setInbox(data.inbox)
    } catch (err) {
      setError(err.message)
    }
  }

  if (loading) return <div className="text-muted-foreground">Chargement...</div>
  if (error) return (
    <div>
      <Button variant="ghost" onClick={() => navigate('/inboxes')} className="mb-4">
        <ArrowLeft className="mr-2 h-4 w-4" /> Retour
      </Button>
      <div className="p-3 text-sm rounded-md bg-destructive/10 text-destructive border border-destructive/20">{error}</div>
    </div>
  )

  return (
    <div>
      <div className="flex items-center gap-4 mb-8">
        <Button variant="ghost" size="sm" onClick={() => navigate('/inboxes')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Retour
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{inbox.name || 'Inbox'}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Cree le {new Date(inbox.created_at).toLocaleDateString('fr-FR')}
          </p>
        </div>
        {inbox.agent_bots && (
          <Badge variant="default" className="ml-auto">{inbox.agent_bots.name}</Badge>
        )}
      </div>

      <Tabs defaultValue="info">
        <TabsList>
          <TabsTrigger value="info"><Info className="mr-1.5 h-4 w-4" />Informations</TabsTrigger>
          <TabsTrigger value="sessions"><MessageSquare className="mr-1.5 h-4 w-4" />Sessions</TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Agent assigne</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label>Choisir un agent</Label>
                <Select
                  value={inbox.agent_bot_id ? String(inbox.agent_bot_id) : 'none'}
                  onValueChange={handleAssignAgent}
                >
                  <SelectTrigger className="w-[240px]">
                    <SelectValue placeholder="Aucun agent" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Aucun agent</SelectItem>
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
              <CardTitle className="text-base">Details</CardTitle>
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
                <CardTitle className="text-base">Widget Embed</CardTitle>
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
        </TabsContent>

        <TabsContent value="sessions" className="mt-6">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Facturable</TableHead>
                  <TableHead>Cree le</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                      Aucune session
                    </TableCell>
                  </TableRow>
                ) : (
                  sessions.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-sm">{s.id}</TableCell>
                      <TableCell>
                        <Badge variant={s.status === 'open' ? 'default' : 'secondary'}>
                          {s.status === 'open' ? 'Ouverte' : 'Fermee'}
                        </Badge>
                      </TableCell>
                      <TableCell>{s.billable ? 'Oui' : 'Non'}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(s.created_at).toLocaleString('fr-FR')}
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
