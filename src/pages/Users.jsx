import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useUsers, useCreateUser, useUpdateUser, useDeleteUser, useProvisionChat } from '../hooks/queries'
import { useI18n } from '../lib/i18n'
import { useAuth } from '../lib/auth'
import { usePageTitle, usePageHeader } from '../lib/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'

export default function Users() {
  const { t } = useI18n()
  const { user: currentUser } = useAuth()
  usePageTitle(t('users.title'))
  const { actionsContainer } = usePageHeader()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editUser, setEditUser] = useState(null)
  const [provisioningId, setProvisioningId] = useState(null)
  const [form, setForm] = useState({ email: '', password: '', first_name: '', last_name: '', role: 'agent', enterprise: '' })
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const { data: users = [], isLoading } = useUsers()
  const createUser = useCreateUser()
  const updateUser = useUpdateUser()
  const deleteUser = useDeleteUser()
  const provisionChat = useProvisionChat()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    try {
      if (editUser) {
        const updates = { ...form }
        if (!updates.password) delete updates.password
        delete updates.email
        await updateUser.mutateAsync({ id: editUser.id, body: updates })
      } else {
        await createUser.mutateAsync(form)
      }
      setDialogOpen(false)
      setEditUser(null)
      resetForm()
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
      await deleteUser.mutateAsync(id)
    } catch (err) {
      setError(err.message)
    }
  }

  const handleProvision = async (userId) => {
    setProvisioningId(userId)
    setError('')
    try {
      await provisionChat.mutateAsync(userId)
    } catch (err) {
      setError(err.message)
    } finally {
      setProvisioningId(null)
    }
  }

  if (isLoading) return <div className="text-muted-foreground">{t('common.loading')}</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-sm text-muted-foreground mt-1">{t('users.subtitle')}</p>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { setEditUser(null); resetForm() } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editUser ? t('users.editTitle') : t('users.dialogTitle')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>{t('common.email')}</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                disabled={!!editUser}
                required={!editUser}
              />
            </div>
            <div className="space-y-2">
              <Label>{editUser ? t('users.newPasswordLabel') : t('common.password')}</Label>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required={!editUser}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{t('users.firstName')}</Label>
                <Input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t('users.lastName')}</Label>
                <Input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{t('users.role')}</Label>
                <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                  <SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">מנהל</SelectItem>
                    <SelectItem value="marketeur">משווק</SelectItem>
                    <SelectItem value="agent">סוכן</SelectItem>
                    {currentUser?.role === 'super_admin' && <SelectItem value="super_admin">סופר אדמין</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('users.enterprise')}</Label>
                <Select value={form.enterprise || '__empty__'} onValueChange={(v) => setForm({ ...form, enterprise: v === '__empty__' ? '' : v })}>
                  <SelectTrigger className="h-10 w-full"><SelectValue placeholder="-" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__empty__">-</SelectItem>
                    <SelectItem value="babait">Babait</SelectItem>
                    <SelectItem value="aviezer">Aviezer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>{t('common.cancel')}</Button>
              <Button type="submit">{editUser ? t('common.save') : t('common.create')}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {error && (
        <div className="p-3 mb-4 text-sm rounded-md bg-destructive/10 text-destructive border border-destructive/20">
          {error}
        </div>
      )}

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('common.email')}</TableHead>
              <TableHead>{t('common.name')}</TableHead>
              <TableHead>{t('users.role')}</TableHead>
              <TableHead>{t('users.enterprise')}</TableHead>
              <TableHead>{t('users.chat')}</TableHead>
              <TableHead>{t('common.actions')}</TableHead>
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
                    <Badge variant="default" className="bg-emerald-600/15 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400 border-0">{t('common.active')}</Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleProvision(u.id)}
                      disabled={provisioningId === u.id}
                    >
                      {provisioningId === u.id ? t('users.activating') : t('users.activateChat')}
                    </Button>
                  )}
                </TableCell>
                <TableCell className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                  <Button size="sm" variant="ghost" onClick={() => handleEdit(u)}>{t('common.edit')}</Button>
                  {u.role !== 'super_admin' && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost" className="text-destructive">{t('common.delete')}</Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t('users.deleteTitle')}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {t('users.deleteDescription', { email: u.email })}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                          <AlertDialogAction variant="destructive" onClick={() => handleDelete(u.id)}>{t('common.delete')}</AlertDialogAction>
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

      {actionsContainer && createPortal(
        <Button onClick={() => setDialogOpen(true)}>{t('common.new')}</Button>,
        actionsContainer
      )}
    </div>
  )
}
