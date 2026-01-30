import { useState, useEffect } from 'react'
import { api } from '../../lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'

export default function PlaybooksTab({ agentBotId }) {
  const [playbooks, setPlaybooks] = useState([])
  const [tools, setTools] = useState([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [form, setForm] = useState({ title: '', content: '', audience: '', rules: '', tool_id: '', is_active: true })
  const [error, setError] = useState('')

  const basePath = `/agent-bots/${agentBotId}`

  const fetchData = async () => {
    try {
      const [pbData, toolsData] = await Promise.all([
        api.get(`${basePath}/playbooks`),
        api.get(`${basePath}/tools`),
      ])
      setPlaybooks(pbData.playbooks)
      setTools(toolsData.tools)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [agentBotId])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    try {
      const body = { ...form, tool_id: form.tool_id ? parseInt(form.tool_id) : null }
      if (editItem) {
        await api.put(`${basePath}/playbooks/${editItem.id}`, body)
      } else {
        await api.post(`${basePath}/playbooks`, body)
      }
      setDialogOpen(false)
      setEditItem(null)
      resetForm()
      fetchData()
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
      await api.delete(`${basePath}/playbooks/${id}`)
      fetchData()
    } catch (err) {
      setError(err.message)
    }
  }

  const toggleActive = async (item) => {
    try {
      await api.put(`${basePath}/playbooks/${item.id}`, { is_active: !item.is_active })
      fetchData()
    } catch (err) {
      setError(err.message)
    }
  }

  if (loading) return <div className="text-muted-foreground">Chargement...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">Instructions et comportements de l'agent</p>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { setEditItem(null); resetForm() } }}>
          <DialogTrigger asChild>
            <Button>+ Nouveau</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editItem ? 'Modifier' : 'Nouveau playbook'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Titre</Label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>Contenu (instructions pour l'agent)</Label>
                <Textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} rows={6} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Audience</Label>
                  <Input value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Tool</Label>
                  <Select value={form.tool_id} onValueChange={(v) => setForm({ ...form, tool_id: v === 'none' ? '' : v })}>
                    <SelectTrigger><SelectValue placeholder="Aucun tool" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Aucun tool</SelectItem>
                      {tools.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Rules</Label>
                <Textarea value={form.rules} onChange={(e) => setForm({ ...form, rules: e.target.value })} rows={3} />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} id="pb-active" />
                <Label htmlFor="pb-active">Actif</Label>
              </div>
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
                <Button type="submit">{editItem ? 'Enregistrer' : 'Creer'}</Button>
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
              <TableHead>Titre</TableHead>
              <TableHead>Audience</TableHead>
              <TableHead>Tool</TableHead>
              <TableHead>Actif</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {playbooks.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Aucun playbook</TableCell></TableRow>
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
                      {pb.is_active ? 'Actif' : 'Inactif'}
                    </Badge>
                  </TableCell>
                  <TableCell className="space-x-2">
                    <Button size="sm" variant="ghost" onClick={() => handleEdit(pb)}>Modifier</Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost" className="text-destructive">Supprimer</Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Supprimer ce playbook ?</AlertDialogTitle>
                          <AlertDialogDescription>Cette action est irreversible.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Annuler</AlertDialogCancel>
                          <AlertDialogAction variant="destructive" onClick={() => handleDelete(pb.id)}>Supprimer</AlertDialogAction>
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
