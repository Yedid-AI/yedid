import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useInboxes, useAgents, useCreateInbox, useDeleteInbox, useAssignAgent } from '../hooks/queries'
import { useI18n } from '../lib/i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'

export default function Inboxes() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState({ name: '', website_url: '', welcome_title: '', welcome_tagline: '' })
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const { t, dateLocale } = useI18n()

  const { data: inboxes = [], isLoading: inboxesLoading } = useInboxes()
  const { data: agents = [], isLoading: agentsLoading } = useAgents()
  const createInbox = useCreateInbox()
  const deleteInbox = useDeleteInbox()
  const assignAgent = useAssignAgent()

  const isLoading = inboxesLoading || agentsLoading

  const handleCreate = async (e) => {
    e.preventDefault()
    setError('')
    try {
      await createInbox.mutateAsync(form)
      setDialogOpen(false)
      setForm({ name: '', website_url: '', welcome_title: '', welcome_tagline: '' })
    } catch (err) {
      setError(err.message)
    }
  }

  const handleAssignAgent = async (inboxId, agentBotId) => {
    try {
      await assignAgent.mutateAsync({ inboxId, agentBotId })
    } catch (err) {
      setError(err.message)
    }
  }

  const handleDelete = async (id) => {
    try {
      await deleteInbox.mutateAsync(id)
    } catch (err) {
      setError(err.message)
    }
  }

  if (isLoading) return <div className="text-muted-foreground">{t('common.loading')}</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('inboxes.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('inboxes.subtitle')}</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setForm({ name: '', website_url: '', welcome_title: '', welcome_tagline: '' }) }}>
          <DialogTrigger asChild>
            <Button>{t('inboxes.newInbox')}</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{t('inboxes.dialogTitle')}</DialogTitle>
            </DialogHeader>
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
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>{t('common.cancel')}</Button>
                <Button type="submit">{t('common.create')}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {error && (
        <div className="p-3 mb-4 text-sm rounded-md bg-destructive/10 text-destructive border border-destructive/20">{error}</div>
      )}

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('common.name')}</TableHead>
              <TableHead>{t('inboxes.agent')}</TableHead>
              <TableHead>{t('common.createdAt')}</TableHead>
              <TableHead>{t('common.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {inboxes.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">{t('inboxes.empty')}</TableCell></TableRow>
            ) : (
              inboxes.map((inbox) => (
                <TableRow key={inbox.id} className="cursor-pointer" onClick={() => navigate(`/inboxes/${inbox.id}`)}>
                  <TableCell className="font-medium">{inbox.name || '-'}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Select
                      value={inbox.agent_bot_id ? String(inbox.agent_bot_id) : 'none'}
                      onValueChange={(v) => handleAssignAgent(inbox.id, v)}
                    >
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder={t('inboxes.noAgent')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t('inboxes.noAgent')}</SelectItem>
                        {agents.map((a) => (
                          <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(inbox.created_at).toLocaleDateString(dateLocale)}
                  </TableCell>
                  <TableCell className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" variant="ghost" onClick={() => navigate(`/inboxes/${inbox.id}`)}>{t('common.details')}</Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost" className="text-destructive">{t('common.delete')}</Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t('inboxes.deleteTitle')}</AlertDialogTitle>
                          <AlertDialogDescription>{t('common.irreversible')}</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                          <AlertDialogAction variant="destructive" onClick={() => handleDelete(inbox.id)}>{t('common.delete')}</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
