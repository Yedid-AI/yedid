import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useBranches, useCreateBranch, useUpdateBranch, useDeleteBranch, useCityIndex, useCreateCityEntry, useDeleteCityEntry } from '../hooks/queries'
import { useI18n } from '../lib/i18n'
import { usePageTitle, usePageHeader } from '../lib/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Building2, MapPin, Trash2 } from 'lucide-react'

const emptyBranchForm = { name: '', contact_name: '', email: '', phone: '', mobile: '', address: '', whatsapp_phone: '' }
const emptyCityForm = { city: '', branch_name: '' }

export default function Branches() {
  const { t } = useI18n()
  usePageTitle(t('branches.title'))
  const { actionsContainer } = usePageHeader()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editBranch, setEditBranch] = useState(null)
  const [form, setForm] = useState(emptyBranchForm)
  const [cityForm, setCityForm] = useState(emptyCityForm)
  const [error, setError] = useState('')

  const { data: branches = [], isLoading } = useBranches()
  const { data: cities = [], isLoading: citiesLoading } = useCityIndex()
  const createBranch = useCreateBranch()
  const updateBranch = useUpdateBranch()
  const deleteBranch = useDeleteBranch()
  const createCity = useCreateCityEntry()
  const deleteCity = useDeleteCityEntry()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    try {
      if (editBranch) {
        await updateBranch.mutateAsync({ id: editBranch.id, body: form })
      } else {
        await createBranch.mutateAsync(form)
      }
      setDialogOpen(false)
      setEditBranch(null)
      setForm(emptyBranchForm)
    } catch (err) {
      setError(err.message)
    }
  }

  const handleEdit = (branch) => {
    setEditBranch(branch)
    setForm({
      name: branch.name || '',
      contact_name: branch.contact_name || '',
      email: branch.email || '',
      phone: branch.phone || '',
      mobile: branch.mobile || '',
      address: branch.address || '',
      whatsapp_phone: branch.whatsapp_phone || '',
    })
    setDialogOpen(true)
  }

  const handleDelete = async (id) => {
    try { await deleteBranch.mutateAsync(id) } catch (err) { setError(err.message) }
  }

  const handleAddCity = async (e) => {
    e.preventDefault()
    setError('')
    try {
      await createCity.mutateAsync(cityForm)
      setCityForm(emptyCityForm)
    } catch (err) {
      setError(err.message)
    }
  }

  const handleDeleteCity = async (id) => {
    try { await deleteCity.mutateAsync(id) } catch (err) { setError(err.message) }
  }

  if (isLoading) return <div className="text-muted-foreground">{t('common.loading')}</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <p className="text-sm text-muted-foreground mt-1">{t('branches.subtitle')}</p>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { setEditBranch(null); setForm(emptyBranchForm) } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editBranch ? t('common.edit') : t('branches.dialogTitle')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>{t('branches.name')}</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{t('branches.contactName')}</Label>
                <Input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t('common.email')}</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{t('branches.phone')}</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t('branches.mobile')}</Label>
                <Input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t('branches.address')}</Label>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>{t('branches.whatsappPhone')}</Label>
              <Input value={form.whatsapp_phone} onChange={(e) => setForm({ ...form, whatsapp_phone: e.target.value })} placeholder="+972..." />
            </div>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>{t('common.cancel')}</Button>
              <Button type="submit">{editBranch ? t('common.save') : t('common.create')}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {error && (
        <div className="p-3 mb-4 text-sm rounded-md bg-destructive/10 text-destructive border border-destructive/20">{error}</div>
      )}

      <Tabs defaultValue="branches">
        <TabsList>
          <TabsTrigger value="branches" className="gap-1.5">
            <Building2 size={14} />
            {t('branches.title')} ({branches.length})
          </TabsTrigger>
          <TabsTrigger value="cities" className="gap-1.5">
            <MapPin size={14} />
            {t('branches.cityIndex')} ({cities.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="branches" className="mt-4">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('branches.name')}</TableHead>
                  <TableHead>{t('branches.contactName')}</TableHead>
                  <TableHead>{t('branches.phone')}</TableHead>
                  <TableHead>{t('branches.address')}</TableHead>
                  <TableHead>{t('branches.whatsappPhone')}</TableHead>
                  <TableHead>{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {branches.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-6">{t('branches.empty')}</TableCell>
                  </TableRow>
                ) : branches.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">{b.name}</TableCell>
                    <TableCell>{b.contact_name || '-'}</TableCell>
                    <TableCell>{b.phone || b.mobile || '-'}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{b.address || '-'}</TableCell>
                    <TableCell>
                      {b.whatsapp_phone ? (
                        <Badge variant="secondary" className="text-xs">{b.whatsapp_phone}</Badge>
                      ) : '-'}
                    </TableCell>
                    <TableCell className="flex gap-2">
                      <Button size="sm" variant="ghost" onClick={() => handleEdit(b)}>{t('common.edit')}</Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="ghost" className="text-destructive">{t('common.delete')}</Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{t('branches.deleteTitle')}</AlertDialogTitle>
                            <AlertDialogDescription>{t('common.irreversible')}</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                            <AlertDialogAction variant="destructive" onClick={() => handleDelete(b.id)}>{t('common.delete')}</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="cities" className="mt-4">
          <form onSubmit={handleAddCity} className="flex gap-3 mb-4 items-end">
            <div className="space-y-1.5 flex-1">
              <Label className="text-xs">{t('branches.city')}</Label>
              <Input value={cityForm.city} onChange={(e) => setCityForm({ ...cityForm, city: e.target.value })} required placeholder={t('branches.cityPlaceholder')} />
            </div>
            <div className="space-y-1.5 flex-1">
              <Label className="text-xs">{t('branches.branchName')}</Label>
              <Input value={cityForm.branch_name} onChange={(e) => setCityForm({ ...cityForm, branch_name: e.target.value })} required placeholder={t('branches.branchNamePlaceholder')} />
            </div>
            <Button type="submit" size="sm">{t('common.create')}</Button>
          </form>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('branches.city')}</TableHead>
                  <TableHead>{t('branches.branchName')}</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(citiesLoading || cities.length === 0) ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground py-6">
                      {citiesLoading ? t('common.loading') : t('branches.emptyCities')}
                    </TableCell>
                  </TableRow>
                ) : cities.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{c.city}</TableCell>
                    <TableCell>{c.branch_name}</TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDeleteCity(c.id)}>
                        <Trash2 size={14} />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      {actionsContainer && createPortal(
        <Button onClick={() => setDialogOpen(true)}>{t('common.new')}</Button>,
        actionsContainer
      )}
    </div>
  )
}
