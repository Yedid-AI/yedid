import { useState, useEffect } from 'react'
import { api } from '../../lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']

export default function ToolsTab({ agentBotId }) {
  const [tools, setTools] = useState([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [form, setForm] = useState({
    name: '', description: '', method: 'GET', url: '',
    query_parameters: '{}', headers: '{}', body_schema: '',
  })
  const [error, setError] = useState('')

  const basePath = `/agent-bots/${agentBotId}`

  const fetchTools = async () => {
    try {
      const data = await api.get(`${basePath}/tools`)
      setTools(data.tools)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchTools() }, [agentBotId])

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
        await api.put(`${basePath}/tools/${editItem.id}`, body)
      } else {
        await api.post(`${basePath}/tools`, body)
      }
      setDialogOpen(false)
      setEditItem(null)
      resetForm()
      fetchTools()
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
      await api.delete(`${basePath}/tools/${id}`)
      fetchTools()
    } catch (err) {
      setError(err.message)
    }
  }

  if (loading) return <div className="text-muted-foreground">Chargement...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">APIs externes accessibles par l'agent</p>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { setEditItem(null); resetForm() } }}>
          <DialogTrigger asChild>
            <Button>+ Nouveau</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editItem ? 'Modifier' : 'Nouveau tool'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Nom</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label>Methode</Label>
                  <Select value={form.method} onValueChange={(v) => setForm({ ...form, method: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>URL</Label>
                <Input type="url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>Description (pour le LLM)</Label>
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Query Parameters (JSON)</Label>
                  <Textarea value={form.query_parameters} onChange={(e) => setForm({ ...form, query_parameters: e.target.value })} rows={3} className="font-mono text-xs" />
                </div>
                <div className="space-y-2">
                  <Label>Headers (JSON)</Label>
                  <Textarea value={form.headers} onChange={(e) => setForm({ ...form, headers: e.target.value })} rows={3} className="font-mono text-xs" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Body Schema (pour $fromAI)</Label>
                <Textarea
                  value={form.body_schema}
                  onChange={(e) => setForm({ ...form, body_schema: e.target.value })}
                  rows={3}
                  className="font-mono text-xs"
                  placeholder='{ "customer_id": "string", "amount": "number" }'
                />
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
              <TableHead>Nom</TableHead>
              <TableHead>Methode</TableHead>
              <TableHead>URL</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tools.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Aucun tool</TableCell></TableRow>
            ) : (
              tools.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell><Badge variant="outline" className="font-mono">{t.method}</Badge></TableCell>
                  <TableCell className="text-muted-foreground truncate max-w-[200px]">{t.url}</TableCell>
                  <TableCell className="truncate max-w-[250px]">{t.description}</TableCell>
                  <TableCell className="space-x-2">
                    <Button size="sm" variant="ghost" onClick={() => handleEdit(t)}>Modifier</Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost" className="text-destructive">Supprimer</Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Supprimer ce tool ?</AlertDialogTitle>
                          <AlertDialogDescription>Les playbooks lies perdront leur tool.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Annuler</AlertDialogCancel>
                          <AlertDialogAction variant="destructive" onClick={() => handleDelete(t.id)}>Supprimer</AlertDialogAction>
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
