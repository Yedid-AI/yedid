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

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']

export default function ToolsTab({ agentBotId }) {
  const { t } = useI18n()
  const { data: tools = [], isLoading } = useTools(agentBotId)
  const createTool = useCreateTool(agentBotId)
  const updateTool = useUpdateTool(agentBotId)
  const deleteTool = useDeleteTool(agentBotId)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [form, setForm] = useState({
    name: '', description: '', method: 'GET', url: '',
    query_parameters: '{}', headers: '{}', body_schema: '',
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
    query_parameters: '{}', headers: '{}', body_schema: '',
  })

  const handleEdit = (item) => {
    setEditItem(item)
    setForm({
      name: item.name, description: item.description, method: item.method, url: item.url,
      query_parameters: JSON.stringify(item.query_parameters || {}, null, 2),
      headers: JSON.stringify(item.headers || {}, null, 2),
      body_schema: item.body_schema || '',
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

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">{t('tools.subtitle')}</p>
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
              <div className="space-y-2">
                <Label>{t('common.name')}</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
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
                <TableRow key={tool.id}>
                  <TableCell className="font-medium">{tool.name}</TableCell>
                  <TableCell><Badge variant="outline" className="font-mono">{tool.method}</Badge></TableCell>
                  <TableCell className="text-muted-foreground truncate max-w-[200px]">{tool.url}</TableCell>
                  <TableCell className="truncate max-w-[250px]">{tool.description}</TableCell>
                  <TableCell className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => handleEdit(tool)}>{t('common.edit')}</Button>
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
