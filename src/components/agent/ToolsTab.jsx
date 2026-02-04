import { useState } from 'react'
import { useTools, useCreateTool, useUpdateTool, useDeleteTool } from '../../hooks/queries'
import { useI18n } from '../../lib/i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { EmojiPicker } from '@/components/ui/emoji-picker'
import { LayoutGrid, List } from 'lucide-react'

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']

export default function ToolsTab({ agentBotId }) {
  const { t } = useI18n()
  const { data: tools = [], isLoading } = useTools(agentBotId)
  const createTool = useCreateTool(agentBotId)
  const updateTool = useUpdateTool(agentBotId)
  const deleteTool = useDeleteTool(agentBotId)
  const [viewMode, setViewMode] = useState('card')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [form, setForm] = useState({
    name: '', description: '', method: 'GET', url: '',
    query_parameters: '{}', headers: '{}', body_schema: '', emoji: '',
  })
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    let qp, hd
    try { qp = JSON.parse(form.query_parameters) } catch { return setError('Query parameters: JSON invalide') }
    try { hd = JSON.parse(form.headers) } catch { return setError('Headers: JSON invalide') }

    try {
      const body = {
        name: form.name, description: form.description, method: form.method,
        url: form.url, query_parameters: qp, headers: hd, body_schema: form.body_schema || null,
        emoji: form.emoji || null,
      }
      if (editItem) {
        await updateTool.mutateAsync({ id: editItem.id, body })
      } else {
        await createTool.mutateAsync(body)
      }
      setDialogOpen(false)
      setEditItem(null)
      resetForm()
    } catch (err) {
      setError(err.message)
    }
  }

  const resetForm = () => setForm({
    name: '', description: '', method: 'GET', url: '',
    query_parameters: '{}', headers: '{}', body_schema: '', emoji: '',
  })

  const handleEdit = (item) => {
    setEditItem(item)
    setForm({
      name: item.name, description: item.description, method: item.method, url: item.url,
      query_parameters: JSON.stringify(item.query_parameters || {}, null, 2),
      headers: JSON.stringify(item.headers || {}, null, 2),
      body_schema: item.body_schema || '',
      emoji: item.emoji || '',
    })
    setDialogOpen(true)
  }

  const handleDelete = async (id) => {
    try {
      await deleteTool.mutateAsync(id)
    } catch (err) {
      setError(err.message)
    }
  }

  if (isLoading) return <div className="text-muted-foreground">{t('common.loading')}</div>

  const deleteButton = (tool) => (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="ghost" className="text-destructive">{t('common.delete')}</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('tools.deleteTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{t('tools.deleteDescription')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => handleDelete(tool.id)}>{t('common.delete')}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">{t('tools.subtitle')}</p>
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
                <SheetTitle>{editItem ? t('common.edit') : t('tools.dialogTitle')}</SheetTitle>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto px-6 py-4">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="flex items-end gap-3">
                  <EmojiPicker value={form.emoji} onChange={(v) => setForm({ ...form, emoji: v })} />
                  <div className="space-y-2 flex-1">
                    <Label>{t('common.name')}</Label>
                    <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                  </div>
                </div>
                <div className="grid grid-cols-[auto_1fr] gap-3">
                  <div className="space-y-2">
                    <Label>{t('tools.method')}</Label>
                    <Select value={form.method} onValueChange={(v) => setForm({ ...form, method: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t('tools.url')}</Label>
                    <Input type="url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} required />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t('tools.description')}</Label>
                  <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} required />
                </div>
                <div className="space-y-2">
                  <Label>{t('tools.queryParams')}</Label>
                  <Textarea value={form.query_parameters} onChange={(e) => setForm({ ...form, query_parameters: e.target.value })} rows={3} className="font-mono text-xs" />
                </div>
                <div className="space-y-2">
                  <Label>{t('tools.headers')}</Label>
                  <Textarea value={form.headers} onChange={(e) => setForm({ ...form, headers: e.target.value })} rows={3} className="font-mono text-xs" />
                </div>
                <div className="space-y-2">
                  <Label>{t('tools.bodySchema')}</Label>
                  <Textarea
                    value={form.body_schema}
                    onChange={(e) => setForm({ ...form, body_schema: e.target.value })}
                    rows={3}
                    className="font-mono text-xs"
                    placeholder={t('tools.bodyPlaceholder')}
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>{t('common.cancel')}</Button>
                  <Button type="submit" disabled={createTool.isPending || updateTool.isPending}>{(createTool.isPending || updateTool.isPending) ? t('common.saving') : editItem ? t('common.save') : t('common.create')}</Button>
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
        tools.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">{t('tools.empty')}</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {tools.map((tool) => (
              <Card key={tool.id} className={`hover:shadow-soft-md transition-all py-0 gap-0 ${editItem?.id === tool.id ? 'ring-2 ring-primary' : ''}`}>
                <div className="p-[15px]">
                  <div className="flex items-start gap-2.5 mb-2">
                    {tool.emoji && <span className="text-xl leading-none shrink-0 mt-0.5">{tool.emoji}</span>}
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-sm truncate leading-tight">{tool.name}</h3>
                      <p className="text-[11px] text-muted-foreground truncate">{tool.url}</p>
                    </div>
                    <Badge variant="outline" className="font-mono shrink-0">{tool.method}</Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground line-clamp-2 mb-2.5">{tool.description}</p>
                  <div className="flex items-center justify-end gap-1 border-t pt-2 -mx-1">
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => handleEdit(tool)}>{t('common.edit')}</Button>
                    {deleteButton(tool)}
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
                <TableHead>{t('tools.method')}</TableHead>
                <TableHead>{t('tools.url')}</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>{t('common.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tools.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">{t('tools.empty')}</TableCell></TableRow>
              ) : (
                tools.map((tool) => (
                  <TableRow key={tool.id} className={editItem?.id === tool.id ? 'bg-primary/5' : ''}>
                    <TableCell className="font-medium">{tool.emoji && <span className="mr-1.5">{tool.emoji}</span>}{tool.name}</TableCell>
                    <TableCell><Badge variant="outline" className="font-mono">{tool.method}</Badge></TableCell>
                    <TableCell className="text-muted-foreground truncate max-w-[200px]">{tool.url}</TableCell>
                    <TableCell className="truncate max-w-[250px]">{tool.description}</TableCell>
                    <TableCell className="flex gap-2">
                      <Button size="sm" variant="ghost" onClick={() => handleEdit(tool)}>{t('common.edit')}</Button>
                      {deleteButton(tool)}
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
