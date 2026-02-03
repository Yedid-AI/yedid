import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useAgents, useDeleteAgent } from '../hooks/queries'
import { useI18n } from '../lib/i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { LayoutGrid, List } from 'lucide-react'

export default function Agents() {
  const { data: agents = [], isLoading, error: queryError } = useAgents()
  const deleteAgent = useDeleteAgent()
  const [viewMode, setViewMode] = useState('card')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const navigate = useNavigate()
  const { t, dateLocale } = useI18n()

  const displayError = error || queryError?.message || ''

  const handleCreate = async (e) => {
    e.preventDefault()
    setError('')
    setCreating(true)
    try {
      const data = await api.post('/agent-bots', { name })
      setDialogOpen(false)
      setName('')
      navigate(`/agents/${data.agent_bot.id}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id) => {
    try {
      await deleteAgent.mutateAsync(id)
    } catch (err) {
      setError(err.message)
    }
  }

  if (isLoading) return <div className="text-muted-foreground">{t('common.loading')}</div>

  const deleteButton = (agent) => (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="ghost" className="text-destructive">{t('common.delete')}</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('agents.deleteTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{t('agents.deleteDescription')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => handleDelete(agent.id)}>{t('common.delete')}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('agents.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('agents.subtitle')}</p>
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
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setName('') }}>
            <DialogTrigger asChild>
              <Button>{t('agents.newAgent')}</Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>{t('agents.dialogTitle')}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-2">
                  <Label>{t('agents.nameLabel')}</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('agents.namePlaceholder')} required />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>{t('common.cancel')}</Button>
                  <Button type="submit" disabled={creating}>{creating ? t('common.saving') : t('common.create')}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {displayError && (
        <div className="p-3 mb-4 text-sm rounded-md bg-destructive/10 text-destructive border border-destructive/20">{displayError}</div>
      )}

      {viewMode === 'card' ? (
        agents.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">{t('agents.empty')}</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {agents.map((a) => (
              <Card key={a.id} className="hover:shadow-soft-md transition-all cursor-pointer py-0 gap-0" onClick={() => navigate(`/agents/${a.id}`)}>
                <div className="p-[15px]">
                  <div className="flex items-center gap-2.5 mb-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-sm truncate leading-tight">{a.name}</h3>
                      <span className="text-[11px] text-muted-foreground">
                        {new Date(a.created_at).toLocaleDateString(dateLocale)}
                      </span>
                    </div>
                    <Badge variant={a.is_active ? 'default' : 'secondary'} className="shrink-0">
                      {a.is_active ? t('common.active') : t('common.inactive')}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-end gap-1 border-t pt-2 -mx-1" onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => navigate(`/agents/${a.id}`)}>
                      {t('common.configure')}
                    </Button>
                    {deleteButton(a)}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('common.name')}</TableHead>
                <TableHead>{t('common.status')}</TableHead>
                <TableHead>{t('common.createdAt')}</TableHead>
                <TableHead>{t('common.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agents.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">{t('agents.empty')}</TableCell></TableRow>
              ) : (
                agents.map((a) => (
                  <TableRow key={a.id} className="cursor-pointer" onClick={() => navigate(`/agents/${a.id}`)}>
                    <TableCell className="font-medium">{a.name}</TableCell>
                    <TableCell>
                      <Badge variant={a.is_active ? 'default' : 'secondary'}>
                        {a.is_active ? t('common.active') : t('common.inactive')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(a.created_at).toLocaleDateString(dateLocale)}
                    </TableCell>
                    <TableCell className="gap-2 flex" onClick={(e) => e.stopPropagation()}>
                      <Button size="sm" variant="ghost" onClick={() => navigate(`/agents/${a.id}`)}>{t('common.configure')}</Button>
                      {deleteButton(a)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  )
}
