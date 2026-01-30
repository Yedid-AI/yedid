import { useState, useEffect } from 'react'
import { useAuth } from '../lib/auth'
import { api } from '../lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Database, Bot, Inbox, Users } from 'lucide-react'

export default function Dashboard() {
  const { user } = useAuth()
  const [stats, setStats] = useState({})

  useEffect(() => {
    if (user?.role === 'agent') return

    if (user?.role === 'admin') {
      Promise.all([
        api.get('/agent-bots').catch(() => ({ agent_bots: [] })),
        api.get('/inboxes').catch(() => ({ inboxes: [] })),
        api.get('/sources').catch(() => ({ sources: [] })),
      ]).then(([a, i, s]) => {
        setStats({
          agents: a.agent_bots?.length || 0,
          inboxes: i.inboxes?.length || 0,
          sources: s.sources?.length || 0,
        })
      })
    }

    if (user?.role === 'super_admin') {
      api.get('/users').then((data) => {
        const users = data.users || []
        const withChatwoot = users.filter((u) => u.chatwoot_accounts).length
        setStats({
          users: users.length,
          comptes_chatwoot: withChatwoot,
        })
      }).catch(() => {})
    }
  }, [user])

  const adminCards = [
    { label: 'Agents', value: stats.agents, icon: Bot },
    { label: 'Inboxes', value: stats.inboxes, icon: Inbox },
    { label: 'Sources', value: stats.sources, icon: Database },
  ]

  const superAdminCards = [
    { label: 'Utilisateurs', value: stats.users, icon: Users },
    { label: 'Comptes Chatwoot', value: stats.comptes_chatwoot, icon: Inbox },
  ]

  const cards = user?.role === 'super_admin' ? superAdminCards : adminCards

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Bienvenue, {user?.first_name || user?.email}
        </p>
      </div>

      {user?.role !== 'agent' && (
        <div className={`grid gap-4 ${cards.length <= 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
          {cards.map((card) => {
            const Icon = card.icon
            return (
              <Card key={card.label} className="hover:shadow-soft-md">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{card.label}</CardTitle>
                  <Icon size={16} className="text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-semibold tracking-tight">{card.value ?? 0}</div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
