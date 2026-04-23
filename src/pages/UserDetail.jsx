import { useParams, useNavigate } from 'react-router-dom'
import { useUser, useBranches, useUserBranches, useAssignBranch, useUnassignBranch } from '../hooks/queries'
import { useI18n } from '../lib/i18n'
import { usePageTitle } from '../lib/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowLeft, User, MessageSquare, BarChart3, FileText, Bot, Inbox, MessageCircle, Building2, X } from 'lucide-react'
import { useState } from 'react'

function maskToken(token) {
  if (!token) return '-'
  if (token.length <= 8) return '--------'
  return token.slice(0, 4) + '--------' + token.slice(-4)
}

export default function UserDetail() {
  const { t, dateLocale } = useI18n()
  const { id } = useParams()
  const navigate = useNavigate()

  const { data, isLoading, error } = useUser(id)
  const user = data?.user
  usePageTitle([user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.email || '')

  if (isLoading) return <div className="text-muted-foreground">{t('common.loading')}</div>
  if (error) return (
    <div>
      <Button variant="ghost" onClick={() => navigate('/users')} className="mb-4">
        <ArrowLeft className="me-2 h-4 w-4 icon-directional" /> {t('common.back')}
      </Button>
      <div className="p-3 text-sm rounded-md bg-destructive/10 text-destructive border border-destructive/20">
        {error.message}
      </div>
    </div>
  )

  const { chatwoot_account, inboxes, agent_bots, stats } = data


  return (
    <div>
      <div className="flex items-center gap-4 mb-8">
        <Button variant="ghost" size="sm" onClick={() => navigate('/users')}>
          <ArrowLeft className="me-2 h-4 w-4 icon-directional" /> {t('common.back')}
        </Button>
        <div>
          <p className="text-sm text-muted-foreground mt-0.5">{user.email}</p>
        </div>
        <Badge variant="secondary" className="ms-auto">{user.role}</Badge>
      </div>

      <Tabs defaultValue="profil">
        <TabsList>
          <TabsTrigger value="profil"><User className="me-1.5 h-4 w-4" />{t('users.profile')}</TabsTrigger>
          {user.role === 'branch' && (
            <TabsTrigger value="branches"><Building2 className="me-1.5 h-4 w-4" />Branches</TabsTrigger>
          )}
          <TabsTrigger value="chatwoot"><MessageSquare className="me-1.5 h-4 w-4" />{t('users.chatwootTab')}</TabsTrigger>
          <TabsTrigger value="stats"><BarChart3 className="me-1.5 h-4 w-4" />{t('users.statsTab')}</TabsTrigger>
        </TabsList>

        {user.role === 'branch' && (
          <TabsContent value="branches" className="mt-6">
            <BranchAssignment userId={user.id} userEnterprise={user.enterprise} />
          </TabsContent>
        )}

        {/* Onglet Profil */}
        <TabsContent value="profil" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('users.info')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">{t('users.firstName')}</span>
                  <p className="font-medium mt-0.5">{user.first_name || '-'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">{t('users.lastName')}</span>
                  <p className="font-medium mt-0.5">{user.last_name || '-'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">{t('common.email')}</span>
                  <p className="font-medium mt-0.5">{user.email}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">{t('users.role')}</span>
                  <p className="mt-0.5"><Badge variant="secondary">{user.role}</Badge></p>
                </div>
                <div>
                  <span className="text-muted-foreground">{t('users.enterprise')}</span>
                  <p className="font-medium mt-0.5">{user.enterprise || '-'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">{t('common.createdAt')}</span>
                  <p className="font-medium mt-0.5">{new Date(user.created_at).toLocaleDateString(dateLocale)}</p>
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
                  <CardTitle className="text-base">{t('users.chatwootAccount')}</CardTitle>
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
                    <CardTitle className="text-base">{t('dashboard.agents')}</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t('common.name')}</TableHead>
                          <TableHead>{t('common.status')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {agent_bots.map((bot) => (
                          <TableRow key={bot.id}>
                            <TableCell className="font-medium">{bot.name}</TableCell>
                            <TableCell>
                              <Badge variant={bot.is_active ? 'default' : 'secondary'}>
                                {bot.is_active ? t('common.active') : t('common.inactive')}
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
                    <CardTitle className="text-base">{t('dashboard.inboxes')}</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t('common.name')}</TableHead>
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
                {t('users.chatwootNotProvisioned')}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Onglet Statistiques */}
        <TabsContent value="stats" className="mt-6">
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{t('dashboard.sources')}</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{stats.sources}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{t('dashboard.agents')}</CardTitle>
                <Bot className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{stats.agents}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{t('dashboard.inboxes')}</CardTitle>
                <Inbox className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{stats.inboxes}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{t('inboxes.sessions')}</CardTitle>
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

function BranchAssignment({ userId, userEnterprise }) {
  const { data: allBranches = [] } = useBranches()
  const { data: assigned = [] } = useUserBranches(userId)
  const assign = useAssignBranch()
  const unassign = useUnassignBranch()
  const [picked, setPicked] = useState('')

  const assignedIds = new Set(assigned.map(a => a.branch_id))
  // Filter available branches: exclude already assigned + match user's enterprise (if any)
  const candidates = allBranches.filter(b => !assignedIds.has(b.id))

  const handleAssign = () => {
    if (!picked) return
    assign.mutate({ userId, branchId: parseInt(picked) }, { onSuccess: () => setPicked('') })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Branches assignees
          {userEnterprise && <span className="text-xs text-muted-foreground ms-2">({userEnterprise})</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Select value={picked} onValueChange={setPicked}>
            <SelectTrigger className="h-9 max-w-xs"><SelectValue placeholder="Choisir une branche" /></SelectTrigger>
            <SelectContent>
              {candidates.map(b => (
                <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={handleAssign} disabled={!picked || assign.isPending}>Ajouter</Button>
        </div>

        {assigned.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune branche assignee — ce user ne verra aucun lead.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Branche</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assigned.map(a => (
                <TableRow key={a.id}>
                  <TableCell>{a.branches?.name || `#${a.branch_id}`}</TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost" onClick={() => unassign.mutate({ userId, branchId: a.branch_id })}>
                      <X className="h-3 w-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
