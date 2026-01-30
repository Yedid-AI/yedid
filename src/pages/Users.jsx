import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'

export default function Users() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editUser, setEditUser] = useState(null)
  const [provisioningId, setProvisioningId] = useState(null)
  const [form, setForm] = useState({ email: '', password: '', first_name: '', last_name: '', role: 'agent', enterprise: '' })
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const fetchUsers = async () => {
    try {
      const data = await api.get('/users')
      setUsers(data.users)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchUsers() }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    try {
      if (editUser) {
        const updates = { ...form }
        if (!updates.password) delete updates.password
        delete updates.email
        await api.put(`/users/${editUser.id}`, updates)
      } else {
        await api.post('/register', form)
      }
      setDialogOpen(false)
      setEditUser(null)
      resetForm()
      fetchUsers()
    } catch (err) {
      setError(err.message)
    }
  }

  const resetForm = () => setForm({ email: '', password: '', first_name: '', last_name: '', role: 'agent', enterprise: '' })

  const handleEdit = (user) => {
    setEditUser(user)
    setForm({
      email: user.email,
      password: '',
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      role: user.role,
      enterprise: user.enterprise || '',
    })
    setDialogOpen(true)
  }

  const handleDelete = async (id) => {
    try {
      await api.delete(`/users/${id}`)
      fetchUsers()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleProvision = async (userId) => {
    setProvisioningId(userId)
    setError('')
    try {
      await api.post('/provision-chat', { user_id: userId })
      fetchUsers()
    } catch (err) {
      setError(err.message)
    } finally {
      setProvisioningId(null)
    }
  }

  if (loading) return <div className="text-muted-foreground">Chargement...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Utilisateurs</h1>
          <p className="text-sm text-muted-foreground mt-1">Gerez les comptes et les acces</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { setEditUser(null); resetForm() } }}>
          <DialogTrigger asChild>
            <Button>+ Nouveau</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editUser ? 'Modifier' : 'Nouvel utilisateur'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  disabled={!!editUser}
                  required={!editUser}
                />
              </div>
              <div className="space-y-2">
                <Label>{editUser ? 'Nouveau mot de passe (optionnel)' : 'Mot de passe'}</Label>
                <Input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required={!editUser}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Prenom</Label>
                  <Input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Nom</Label>
                  <Input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="agent">Agent</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="super_admin">Super Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Entreprise</Label>
                  <Input value={form.enterprise} onChange={(e) => setForm({ ...form, enterprise: e.target.value })} />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
                <Button type="submit">{editUser ? 'Enregistrer' : 'Creer'}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {error && (
        <div className="p-3 mb-4 text-sm rounded-md bg-destructive/10 text-destructive border border-destructive/20">
          {error}
        </div>
      )}

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Nom</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Entreprise</TableHead>
              <TableHead>Chat</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id} className="cursor-pointer" onClick={() => navigate(`/users/${u.id}`)}>
                <TableCell>{u.email}</TableCell>
                <TableCell>{[u.first_name, u.last_name].filter(Boolean).join(' ') || '-'}</TableCell>
                <TableCell><Badge variant="secondary">{u.role}</Badge></TableCell>
                <TableCell>{u.enterprise || '-'}</TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  {u.chatwoot_accounts ? (
                    <Badge variant="default" className="bg-emerald-600/15 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400 border-0">Actif</Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleProvision(u.id)}
                      disabled={provisioningId === u.id}
                    >
                      {provisioningId === u.id ? 'Activation...' : 'Activer Chat'}
                    </Button>
                  )}
                </TableCell>
                <TableCell className="space-x-2" onClick={(e) => e.stopPropagation()}>
                  <Button size="sm" variant="ghost" onClick={() => handleEdit(u)}>Modifier</Button>
                  {u.role !== 'super_admin' && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost" className="text-destructive">Supprimer</Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Supprimer cet utilisateur ?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Cette action est irreversible. L'utilisateur {u.email} sera supprime.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Annuler</AlertDialogCancel>
                          <AlertDialogAction variant="destructive" onClick={() => handleDelete(u.id)}>Supprimer</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
