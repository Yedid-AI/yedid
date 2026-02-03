import { useState } from 'react'
import { usePlaybooksLibrary, useToolsLibrary, useCreatePlaybookLibrary, useUpdatePlaybookLibrary, useDeletePlaybookLibrary } from '../hooks/queries'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { LayoutGrid, List } from 'lucide-react'

export default function PlaybooksLibrary() {
  const { t } = useI18n()
  const playbooksQuery = usePlaybooksLibrary()
  const toolsQuery = useToolsLibrary()
  const createPlaybook = useCreatePlaybookLibrary()
  const updatePlaybook = useUpdatePlaybookLibrary()
  const deletePlaybook = useDeletePlaybookLibrary()
  const playbooks = playbooksQuery.data || []
  const tools = toolsQuery.data || []
  const isLoading = playbooksQuery.isLoading || toolsQuery.isLoading
  const [viewMode, setViewMode] = useState('card')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [form, setForm] = useState({ title: '', content: '', audience: '', rules: '', tool_id: '', is_active: true })
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    try {
      const body = { ...form, tool_id: form.tool_id ? parseInt(form.tool_id) : null }
      if (editItem) {
        await updatePlaybook.mutateAsync({ id: editItem.id, body })
      } else {
        await createPlaybook.mutateAsync(body)
      }
      setDialogOpen(false)
      setEditItem(null)
      resetForm()
    } catch (err) {
      setError(err.message)
    }
  }

  const resetForm = () => setForm({ title: '', content: '', audience: '', rules: '', tool_id: '', is_active: true })

  const handleEdit = (item) => {
    setEditItem(item)
    setForm({
      title: item.title,
      content: item.content,
      audience: item.audience || '',
      rules: item.rules || '',
      tool_id: item.tools?.id ? String(item.tools.id) : '',
      is_active: item.is_active,
    })
    setDialogOpen(true)
  }

  const handleDelete = async (id) => {
    try {
      await deletePlaybook.mutateAsync(id)
    } catch (err) {
      setError(err.message)
    }
  }

  const toggleActive = async (item) => {
    try {
      await updatePlaybook.mutateAsync({ id: item.id, body: { is_active: !item.is_active } })
    } catch (err) {
      setError(err.message)
    }
  }

  if (isLoading) return <div className="text-muted-foreground">{t('common.loading')}</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('playbooks.libraryTitle')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('playbooks.librarySubtitle')}</p>
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
        <Sheet open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { setEditItem(null); resetForm() } }}>
          <SheetTrigger asChild>
            <Button>{t('common.new')}</Button>
          </SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>{editItem ? t('common.edit') : t('playbooks.dialogTitle')}</SheetTitle>
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
                <Label>{t('common.rules')}</Label>
                <RichEditor value={form.rules} onChange={(md) => setForm({ ...form, rules: md })} placeholder={t('playbooks.rulesPlaceholder')} minHeight="100px" />
              </div>
              <div className="space-y-2">
                <Label>{t('playbooks.content')}</Label>
                <RichEditor value={form.content} onChange={(md) => setForm({ ...form, content: md })} placeholder={t('playbooks.contentPlaceholder')} minHeight="150px" />
              </div>
              <div className="space-y-2">
                <Label>{t('playbooks.tool')}</Label>
                <Select value={form.tool_id} onValueChange={(v) => setForm({ ...form, tool_id: v === 'none' ? '' : v })}>
                  <SelectTrigger><SelectValue placeholder={t('playbooks.noTool')} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('playbooks.noTool')}</SelectItem>
                    {tools.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} id="pb-active" />
                <Label htmlFor="pb-active">{t('common.active')}</Label>
              </div>
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>{t('common.cancel')}</Button>
                <Button type="submit" disabled={createPlaybook.isPending || updatePlaybook.isPending}>{(createPlaybook.isPending || updatePlaybook.isPending) ? t('common.saving') : editItem ? t('common.save') : t('common.create')}</Button>
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
        playbooks.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">{t('playbooks.empty')}</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {playbooks.map((pb) => (
              <Card key={pb.id} className="hover:shadow-soft-md transition-all py-0 gap-0">
                <div className="p-[15px]">
                  <div className="flex items-center gap-2.5 mb-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-sm truncate leading-tight">{pb.title}</h3>
                      <span className="text-[11px] text-muted-foreground">{pb.audience || '-'}</span>
                    </div>
                    <Badge
                      variant={pb.is_active ? 'default' : 'secondary'}
                      className="cursor-pointer shrink-0"
                      onClick={() => toggleActive(pb)}
                    >
                      {pb.is_active ? t('common.active') : t('common.inactive')}
                    </Badge>
                  </div>
                  {pb.tools?.name && (
                    <div className="text-[11px] text-muted-foreground mb-2.5">
                      {t('playbooks.tool')}: <span className="text-foreground">{pb.tools.name}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-end gap-1 border-t pt-2 -mx-1">
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => handleEdit(pb)}>{t('common.edit')}</Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive">{t('common.delete')}</Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t('playbooks.deleteTitle')}</AlertDialogTitle>
                          <AlertDialogDescription>{t('common.irreversible')}</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                          <AlertDialogAction variant="destructive" onClick={() => handleDelete(pb.id)}>{t('common.delete')}</AlertDialogAction>
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
                <TableHead>{t('common.audience')}</TableHead>
                <TableHead>{t('playbooks.tool')}</TableHead>
                <TableHead>{t('common.active')}</TableHead>
                <TableHead>{t('common.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {playbooks.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">{t('playbooks.empty')}</TableCell></TableRow>
              ) : (
                playbooks.map((pb) => (
                  <TableRow key={pb.id}>
                    <TableCell className="font-medium">{pb.title}</TableCell>
                    <TableCell>{pb.audience || '-'}</TableCell>
                    <TableCell>{pb.tools?.name || '-'}</TableCell>
                    <TableCell>
                      <Badge
                        variant={pb.is_active ? 'default' : 'secondary'}
                        className="cursor-pointer"
                        onClick={() => toggleActive(pb)}
                      >
                        {pb.is_active ? t('common.active') : t('common.inactive')}
                      </Badge>
                    </TableCell>
                    <TableCell className="flex gap-2">
                      <Button size="sm" variant="ghost" onClick={() => handleEdit(pb)}>{t('common.edit')}</Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="ghost" className="text-destructive">{t('common.delete')}</Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{t('playbooks.deleteTitle')}</AlertDialogTitle>
                            <AlertDialogDescription>{t('common.irreversible')}</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                            <AlertDialogAction variant="destructive" onClick={() => handleDelete(pb.id)}>{t('common.delete')}</AlertDialogAction>
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
