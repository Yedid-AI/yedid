import { useState } from 'react'
import { useEscalationRulesLibrary, useCreateEscalationLibrary, useUpdateEscalationLibrary, useDeleteEscalationLibrary } from '../hooks/queries'
import { useI18n } from '../lib/i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { RichEditor } from '@/components/ui/rich-editor'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'

export default function EscalationLibrary() {
  const { t } = useI18n()
  const { data: rules = [], isLoading } = useEscalationRulesLibrary()
  const createEscalation = useCreateEscalationLibrary()
  const updateEscalation = useUpdateEscalationLibrary()
  const deleteEscalation = useDeleteEscalationLibrary()
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
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('escalation.libraryTitle')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('escalation.librarySubtitle')}</p>
        </div>
        <Sheet open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { setEditItem(null); resetForm() } }}>
          <SheetTrigger asChild>
            <Button>{t('common.new')}</Button>
          </SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>{editItem ? t('common.edit') : t('escalation.dialogTitle')}</SheetTitle>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto px-6 py-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>{t('common.title')}</Label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>{t('common.audience')}</Label>
                <Input value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t('escalation.trigger')}</Label>
                <RichEditor value={form.trigger_description} onChange={(md) => setForm({ ...form, trigger_description: md })} placeholder={t('escalation.triggerPlaceholder')} minHeight="100px" />
              </div>
              <div className="space-y-2">
                <Label>{t('escalation.rules')}</Label>
                <RichEditor value={form.rules} onChange={(md) => setForm({ ...form, rules: md })} placeholder={t('escalation.rulesPlaceholder')} minHeight="100px" />
              </div>
              <div className="space-y-2">
                <Label>{t('escalation.assignTo')}</Label>
                <Input type="number" value={form.assign_to_agent} onChange={(e) => setForm({ ...form, assign_to_agent: e.target.value })} />
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
            </div>
          </SheetContent>
        </Sheet>
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
