import { useState } from 'react'
import { useEscalationRules, useCreateEscalation, useUpdateEscalation, useDeleteEscalation } from '../../hooks/queries'
import { useI18n } from '../../lib/i18n'
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
import { EmojiPicker } from '@/components/ui/emoji-picker'
import { LayoutGrid, List } from 'lucide-react'

export default function EscalationTab({ agentBotId }) {
  const { t } = useI18n()
  const { data: rules = [], isLoading } = useEscalationRules(agentBotId)
  const createEscalation = useCreateEscalation(agentBotId)
  const updateEscalation = useUpdateEscalation(agentBotId)
  const deleteEscalation = useDeleteEscalation(agentBotId)
  const [viewMode, setViewMode] = useState('card')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [form, setForm] = useState({ title: '', trigger_description: '', rules: '', audience: '', assign_to_agent: '', emoji: '', is_active: true })
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

  const resetForm = () => setForm({ title: '', trigger_description: '', rules: '', audience: '', assign_to_agent: '', emoji: '', is_active: true })

  const handleEdit = (item) => {
    setEditItem(item)
    setForm({
      title: item.title,
      trigger_description: item.trigger_description || '',
      rules: typeof item.rules === 'string' ? item.rules : Array.isArray(item.rules) ? item.rules.join('\n') : '',
      audience: item.audience || '',
      assign_to_agent: item.assign_to_agent ? String(item.assign_to_agent) : '',
      emoji: item.emoji || '',
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
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 border rounded-lg p-0.5">
            <button className={`p-1.5 rounded-md transition-colors ${viewMode === 'card' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'}`} onClick={() => setViewMode('card')}>
              <LayoutGrid size={14} />
            </button>
            <button className={`p-1.5 rounded-md transition-colors ${viewMode === 'table' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'}`} onClick={() => setViewMode('table')}>
              <List size={14} />
            </button>
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
              <div className="flex items-end gap-3">
                <EmojiPicker value={form.emoji} onChange={(v) => setForm({ ...form, emoji: v })} />
                <div className="space-y-2 flex-1">
                  <Label>{t('common.title')}</Label>
                  <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
                </div>
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
                <Button type="submit" disabled={createEscalation.isPending || updateEscalation.isPending}>{(createEscalation.isPending || updateEscalation.isPending) ? t('common.saving') : editItem ? t('common.save') : t('common.create')}</Button>
              </div>
            </form>
            </div>
          </SheetContent>
        </Sheet>
        </div>
      </div>

      {error && (
        <div className="p-3 mb-4 text-sm rounded-md bg-destructive/10 text-destructive border border-destructive/20">{error}</div>
      )}

      {viewMode === 'card' ? (
        rules.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">{t('escalation.empty')}</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {rules.map((r) => (
              <Card key={r.id} className={`hover:shadow-soft-md transition-all py-0 gap-0 ${editItem?.id === r.id ? 'ring-2 ring-primary' : ''}`}>
                <div className="p-[15px]">
                  <div className="flex items-start gap-2.5 mb-2">
                    {r.emoji && <span className="text-xl leading-none shrink-0 mt-0.5">{r.emoji}</span>}
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-sm truncate leading-tight">{r.title}</h3>
                      <p className="text-[11px] text-muted-foreground truncate">{r.audience || '-'}</p>
                    </div>
                    <Badge
                      variant={r.is_active ? 'default' : 'secondary'}
                      className="cursor-pointer shrink-0"
                      onClick={() => toggleActive(r)}
                    >
                      {r.is_active ? t('common.active') : t('common.inactive')}
                    </Badge>
                  </div>
                  {r.trigger_description && (
                    <p className="text-[11px] text-muted-foreground line-clamp-2 mb-2.5">{r.trigger_description}</p>
                  )}
                  <div className="flex items-center justify-end gap-1 border-t pt-2 -mx-1">
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => handleEdit(r)}>{t('common.edit')}</Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive">{t('common.delete')}</Button>
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
                  <TableRow key={r.id} className={editItem?.id === r.id ? 'bg-primary/5' : ''}>
                    <TableCell className="font-medium">{r.emoji && <span className="me-1.5">{r.emoji}</span>}{r.title}</TableCell>
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
      )}
    </div>
  )
}
