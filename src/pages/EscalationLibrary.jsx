import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useEscalationRulesLibrary, useCreateEscalationLibrary, useUpdateEscalationLibrary, useDeleteEscalationLibrary } from '../hooks/queries'
import { useI18n } from '../lib/i18n'
import { usePageTitle, usePageHeader } from '../lib/page-header'
import { useSidePanel } from '../lib/side-panel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { RichEditor } from '@/components/ui/rich-editor'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { EmojiPicker } from '@/components/ui/emoji-picker'
import { LayoutGrid, List } from 'lucide-react'

export default function EscalationLibrary() {
  const { t } = useI18n()
  usePageTitle(t('escalation.libraryTitle'))
  const { actionsContainer } = usePageHeader()
  const { data: rules = [], isLoading } = useEscalationRulesLibrary()
  const createEscalation = useCreateEscalationLibrary()
  const updateEscalation = useUpdateEscalationLibrary()
  const deleteEscalation = useDeleteEscalationLibrary()
  const [viewMode, setViewMode] = useState('card')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [form, setForm] = useState({ title: '', trigger_description: '', rules: '', audience: '', assign_to_agent: '', emoji: '' })
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

  const resetForm = () => setForm({ title: '', trigger_description: '', rules: '', audience: '', assign_to_agent: '', emoji: '' })

  const handleEdit = (item) => {
    setEditItem(item)
    setForm({
      title: item.title,
      trigger_description: item.trigger_description || '',
      rules: typeof item.rules === 'string' ? item.rules : Array.isArray(item.rules) ? item.rules.join('\n') : '',
      audience: item.audience || '',
      assign_to_agent: item.assign_to_agent ? String(item.assign_to_agent) : '',
      emoji: item.emoji || '',
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

  const closePanel = () => { setDialogOpen(false); setEditItem(null); resetForm() }
  const { panelContainer } = useSidePanel(dialogOpen)

  if (isLoading) return <div className="text-muted-foreground">{t('common.loading')}</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-sm text-muted-foreground mt-1">{t('escalation.librarySubtitle')}</p>
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
        </div>
      </div>

      {error && (
        <div className="p-3 mb-4 text-sm rounded-md bg-destructive/10 text-destructive border border-destructive/20">{error}</div>
      )}

      {viewMode === 'card' ? (
        rules.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">{t('escalation.empty')}</p>
        ) : (
          <div className={`grid gap-4 ${dialogOpen ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'}`}>
            {rules.map((r) => (
              <Card key={r.id} className={`hover:shadow-soft-md transition-all py-0 gap-0 cursor-pointer ${editItem?.id === r.id ? 'ring-2 ring-primary' : ''}`} onClick={() => handleEdit(r)}>
                <div className="p-[15px]">
                  <div className="flex items-start gap-2.5">
                    {r.emoji && <span className="text-xl leading-none shrink-0 mt-0.5">{r.emoji}</span>}
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-sm truncate leading-tight">{r.title}</h3>
                      <p className="text-[11px] text-muted-foreground truncate">{r.audience || '-'}</p>
                    </div>
                  </div>
                  {r.trigger_description && (
                    <p className="text-[11px] text-muted-foreground line-clamp-2 mt-2">{r.trigger_description}</p>
                  )}
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
                <TableHead>{t('common.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">{t('escalation.empty')}</TableCell></TableRow>
              ) : (
                rules.map((r) => (
                  <TableRow key={r.id} className={editItem?.id === r.id ? 'bg-primary/5' : ''}>
                    <TableCell className="font-medium">{r.emoji && <span className="mr-1.5">{r.emoji}</span>}{r.title}</TableCell>
                    <TableCell className="truncate max-w-[250px]">{r.trigger_description || '-'}</TableCell>
                    <TableCell>{r.audience || '-'}</TableCell>
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

      {panelContainer && createPortal(
        <div className="w-full h-full flex flex-col">
          <div className="flex items-center justify-between px-6 py-3 border-b shrink-0">
            <h3 className="text-sm font-semibold">{editItem ? t('common.edit') : t('escalation.dialogTitle')}</h3>
            <div className="flex items-center gap-2">
              {editItem && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive">{t('common.delete')}</Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t('escalation.deleteTitle')}</AlertDialogTitle>
                      <AlertDialogDescription>{t('common.irreversible')}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                      <AlertDialogAction variant="destructive" onClick={() => { handleDelete(editItem.id); closePanel() }}>{t('common.delete')}</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={closePanel}>{t('common.cancel')}</Button>
              <Button size="sm" className="h-7 text-xs" type="submit" form="escalation-form" disabled={createEscalation.isPending || updateEscalation.isPending}>
                {(createEscalation.isPending || updateEscalation.isPending) ? t('common.saving') : editItem ? t('common.save') : t('common.create')}
              </Button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <form id="escalation-form" onSubmit={handleSubmit} className="space-y-4">
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
            </form>
          </div>
        </div>,
        panelContainer
      )}

      {actionsContainer && createPortal(
        <Button onClick={() => setDialogOpen(true)}>{t('common.new')}</Button>,
        actionsContainer
      )}
    </div>
  )
}
