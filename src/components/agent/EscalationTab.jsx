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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'

export default function EscalationTab({ agentBotId }) {
  const [rules, setRules] = useState([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [form, setForm] = useState({ title: '', trigger_description: '', rules: '', audience: '', assign_to_agent: '', is_active: true })
  const [error, setError] = useState('')

  const basePath = `/agent-bots/${agentBotId}`

  const fetchRules = async () => {
    try {
      const data = await api.get(`${basePath}/escalation-rules`)
      setRules(data.rules)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchRules() }, [agentBotId])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    try {
      const body = { ...form, assign_to_agent: form.assign_to_agent ? parseInt(form.assign_to_agent) : null }
      if (editItem) {
        await api.put(`${basePath}/escalation-rules/${editItem.id}`, body)
      } else {
        await api.post(`${basePath}/escalation-rules`, body)
      }
      setDialogOpen(false)
      setEditItem(null)
      resetForm()
      fetchRules()
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
      await api.delete(`${basePath}/escalation-rules/${id}`)
      fetchRules()
    } catch (err) {
      setError(err.message)
    }
  }

  const toggleActive = async (item) => {
    try {
      await api.put(`${basePath}/escalation-rules/${item.id}`, { is_active: !item.is_active })
      fetchRules()
    } catch (err) {
      setError(err.message)
    }
  }

  if (loading) return <div className="text-muted-foreground">Chargement...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">Regles de transfert vers un agent humain</p>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { setEditItem(null); resetForm() } }}>
          <DialogTrigger asChild>
            <Button>+ Nouveau</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editItem ? 'Modifier' : 'Nouvelle regle'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Titre</Label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>Trigger description</Label>
                <Textarea value={form.trigger_description} onChange={(e) => setForm({ ...form, trigger_description: e.target.value })} rows={3} />
              </div>
              <div className="space-y-2">
                <Label>Rules (instructions pour l'agent)</Label>
                <Textarea value={form.rules} onChange={(e) => setForm({ ...form, rules: e.target.value })} rows={3} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Audience</Label>
                  <Input value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Assigner a l'agent (ID)</Label>
                  <Input type="number" value={form.assign_to_agent} onChange={(e) => setForm({ ...form, assign_to_agent: e.target.value })} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} id="esc-active" />
                <Label htmlFor="esc-active">Actif</Label>
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
              <TableHead>Trigger</TableHead>
              <TableHead>Audience</TableHead>
              <TableHead>Actif</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Aucune regle</TableCell></TableRow>
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
                      {r.is_active ? 'Actif' : 'Inactif'}
                    </Badge>
                  </TableCell>
                  <TableCell className="space-x-2">
                    <Button size="sm" variant="ghost" onClick={() => handleEdit(r)}>Modifier</Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost" className="text-destructive">Supprimer</Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Supprimer cette regle ?</AlertDialogTitle>
                          <AlertDialogDescription>Cette action est irreversible.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Annuler</AlertDialogCancel>
                          <AlertDialogAction variant="destructive" onClick={() => handleDelete(r.id)}>Supprimer</AlertDialogAction>
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
