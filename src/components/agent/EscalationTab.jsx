import { useState } from 'react'
import { useEscalationRules, useCreateEscalation, useUpdateEscalation, useDeleteEscalation } from '../../hooks/queries'
import { useI18n } from '../../lib/i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'

export default function EscalationTab({ agentBotId }) {
  const { t } = useI18n()
  const { data: rules = [], isLoading } = useEscalationRules(agentBotId)
  const createEscalation = useCreateEscalation(agentBotId)
  const updateEscalation = useUpdateEscalation(agentBotId)
  const deleteEscalation = useDeleteEscalation(agentBotId)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [form, setForm] = useState({ title: '', trigger_description: '', rules: '', audience: '', assign_to_agent: '', is_active: true })
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    try {
      const body = { ...form, assign_to_agent: form.assign_to_agent ? parseInt(form.assign_to_agent) : null }
      if (editItem) {
        await updateEscalation.mutateAsync({ id: editItem.id, body })
      } else {
        await createEscalation.mutateAsync(body)
      }
      setDialogOpen(false)
      setEditItem(null)
      resetForm()
    } catch (err) {
      setError(err.message)
    }
  }

  const resetForm = () => setForm({ title: '', trigger_description: '', rules: '', audience: '', assign_to_agent: '', is_active: true })

  const handleEdit = (item) => {
    setEditItem(item)
    setForm({
      title: item.title,
      trigger_description: item.trigger_description || '',
      rules: item.rules || '',
      audience: item.audience || '',
      assign_to_agent: item.assign_to_agent ? String(item.assign_to_agent) : '',
      is_active: item.is_active,
    })
    setDialogOpen(true)
  }

  const handleDelete = async (id) => {
    try {
      await deleteEscalation.mutateAsync(id)
    } catch (err) {
      setError(err.message)
    }
  }

  const toggleActive = async (item) => {
    try {
      await updateEscalation.mutateAsync({ id: item.id, body: { is_active: !item.is_active } })
    } catch (err) {
      setError(err.message)
    }
  }

  if (isLoading) return <div className="text-muted-foreground">{t('common.loading')}</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">{t('escalation.subtitle')}</p>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { setEditItem(null); resetForm() } }}>
          <DialogTrigger asChild>
            <Button>{t('common.new')}</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editItem ? t('common.edit') : t('escalation.dialogTitle')}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>{t('common.title')}</Label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>{t('escalation.trigger')}</Label>
                <Textarea value={form.trigger_description} onChange={(e) => setForm({ ...form, trigger_description: e.target.value })} rows={3} />
              </div>
              <div className="space-y-2">
                <Label>{t('escalation.rules')}</Label>
                <Textarea value={form.rules} onChange={(e) => setForm({ ...form, rules: e.target.value })} rows={3} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>{t('common.audience')}</Label>
                  <Input value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>{t('escalation.assignTo')}</Label>
                  <Input type="number" value={form.assign_to_agent} onChange={(e) => setForm({ ...form, assign_to_agent: e.target.value })} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} id="esc-active" />
                <Label htmlFor="esc-active">{t('common.active')}</Label>
              </div>
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>{t('common.cancel')}</Button>
                <Button type="submit">{editItem ? t('common.save') : t('common.create')}</Button>
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
              <TableHead>{t('common.title')}</TableHead>
              <TableHead>Trigger</TableHead>
              <TableHead>{t('common.audience')}</TableHead>
              <TableHead>{t('common.active')}</TableHead>
              <TableHead>{t('common.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">{t('escalation.empty')}</TableCell></TableRow>
            ) : (
              rules.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.title}</TableCell>
                  <TableCell className="truncate max-w-[250px]">{r.trigger_description || '-'}</TableCell>
                  <TableCell>{r.audience || '-'}</TableCell>
                  <TableCell>
                    <Badge
                      variant={r.is_active ? 'default' : 'secondary'}
                      className="cursor-pointer"
                      onClick={() => toggleActive(r)}
                    >
                      {r.is_active ? t('common.active') : t('common.inactive')}
                    </Badge>
                  </TableCell>
                  <TableCell className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => handleEdit(r)}>{t('common.edit')}</Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost" className="text-destructive">{t('common.delete')}</Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t('escalation.deleteTitle')}</AlertDialogTitle>
                          <AlertDialogDescription>{t('common.irreversible')}</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                          <AlertDialogAction variant="destructive" onClick={() => handleDelete(r.id)}>{t('common.delete')}</AlertDialogAction>
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
