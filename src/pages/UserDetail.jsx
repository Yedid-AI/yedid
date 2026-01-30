import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ArrowLeft, User, MessageSquare, BarChart3, FileText, Bot, Inbox, MessageCircle } from 'lucide-react'

function maskToken(token) {
  if (!token) return '-'
  if (token.length <= 8) return '••••••••'
  return token.slice(0, 4) + '••••••••' + token.slice(-4)
}

export default function UserDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const fetchDetail = async () => {
      try {
        const result = await api.get(`/users/${id}`)
        setData(result)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    fetchDetail()
  }, [id])

  if (loading) return <div className="text-muted-foreground">Chargement...</div>
  if (error) return (
    <div>
      <Button variant="ghost" onClick={() => navigate('/users')} className="mb-4">
        <ArrowLeft className="mr-2 h-4 w-4" /> Retour
      </Button>
      <div className="p-3 text-sm rounded-md bg-destructive/10 text-destructive border border-destructive/20">
        {error}
      </div>
    </div>
  )

  const { user, chatwoot_account, inboxes, agent_bots, stats } = data

  return (
    <div>
      <div className="flex items-center gap-4 mb-8">
        <Button variant="ghost" size="sm" onClick={() => navigate('/users')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Retour
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {[user.first_name, user.last_name].filter(Boolean).join(' ') || user.email}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{user.email}</p>
        </div>
        <Badge variant="secondary" className="ml-auto">{user.role}</Badge>
      </div>

      <Tabs defaultValue="profil">
        <TabsList>
          <TabsTrigger value="profil"><User className="mr-1.5 h-4 w-4" />Profil</TabsTrigger>
          <TabsTrigger value="chatwoot"><MessageSquare className="mr-1.5 h-4 w-4" />Chatwoot</TabsTrigger>
          <TabsTrigger value="stats"><BarChart3 className="mr-1.5 h-4 w-4" />Statistiques</TabsTrigger>
        </TabsList>

        {/* Onglet Profil */}
        <TabsContent value="profil" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Informations</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Prenom</span>
                  <p className="font-medium mt-0.5">{user.first_name || '-'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Nom</span>
                  <p className="font-medium mt-0.5">{user.last_name || '-'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Email</span>
                  <p className="font-medium mt-0.5">{user.email}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Role</span>
                  <p className="mt-0.5"><Badge variant="secondary">{user.role}</Badge></p>
                </div>
                <div>
                  <span className="text-muted-foreground">Entreprise</span>
                  <p className="font-medium mt-0.5">{user.enterprise || '-'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Cree le</span>
                  <p className="font-medium mt-0.5">{new Date(user.created_at).toLocaleDateString('fr-FR')}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Onglet Chatwoot */}
        <TabsContent value="chatwoot" className="mt-6 space-y-6">
          {chatwoot_account ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Compte Chatwoot</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Account ID</span>
                      <p className="font-medium mt-0.5">{chatwoot_account.account_id}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">User ID</span>
                      <p className="font-medium mt-0.5">{chatwoot_account.chatwoot_user_id || '-'}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Access Token</span>
                      <p className="font-mono text-xs mt-0.5">{maskToken(chatwoot_account.access_token)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Pubsub Token</span>
                      <p className="font-mono text-xs mt-0.5">{maskToken(chatwoot_account.pubsub_token)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {agent_bots && agent_bots.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Agents</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nom</TableHead>
                          <TableHead>Statut</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {agent_bots.map((bot) => (
                          <TableRow key={bot.id}>
                            <TableCell className="font-medium">{bot.name}</TableCell>
                            <TableCell>
                              <Badge variant={bot.is_active ? 'default' : 'secondary'}>
                                {bot.is_active ? 'Actif' : 'Inactif'}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}

              {inboxes.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Inboxes</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nom</TableHead>
                          <TableHead>Inbox ID</TableHead>
                          <TableHead>Website Token</TableHead>
                          <TableHead>Agent</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {inboxes.map((inbox) => {
                          const assignedAgent = agent_bots?.find((a) => a.id === inbox.agent_bot_id)
                          return (
                            <TableRow key={inbox.id}>
                              <TableCell>{inbox.name || '-'}</TableCell>
                              <TableCell>{inbox.inbox_id}</TableCell>
                              <TableCell className="font-mono text-xs">{maskToken(inbox.website_token)}</TableCell>
                              <TableCell>{assignedAgent?.name || '-'}</TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Chatwoot non provisionne pour cet utilisateur.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Onglet Statistiques */}
        <TabsContent value="stats" className="mt-6">
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Sources</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{stats.sources}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Agents</CardTitle>
                <Bot className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{stats.agents}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Inboxes</CardTitle>
                <Inbox className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{stats.inboxes}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Sessions</CardTitle>
                <MessageCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{stats.sessions}</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
