import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
import {
  useUsers, useBranches, useAllUserBranches,
  useCreateUser, useDeleteUser,
  useCreateBranch, useUpdateBranch, useDeleteBranch,
  useAssignBranch, useUnassignBranch,
} from '../hooks/queries'
import { Switch } from '@/components/ui/switch'
import { useAuth } from '../lib/auth'
import { useI18n } from '../lib/i18n'
import { usePageTitle, usePageHeader } from '../lib/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Building2, ChevronRight, ChevronDown, Plus, X, UserPlus, Crown, Megaphone, Users as UsersIcon, Phone, MapPin, MessageCircle, Pencil, Home } from 'lucide-react'

const AVATAR_COLORS = [
  'bg-blue-500', 'bg-emerald-500', 'bg-violet-500', 'bg-amber-500',
  'bg-rose-500', 'bg-cyan-500', 'bg-fuchsia-500', 'bg-lime-600',
  'bg-indigo-500', 'bg-orange-500', 'bg-teal-500', 'bg-pink-500',
]
function nameColor(name) {
  if (!name) return AVATAR_COLORS[0]
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

const ROLE_LABEL = {
  super_admin: 'Super admin',
  admin: 'Admin',
  marketeur: 'Marketeur',
  branch: 'Sniff',
  agent: 'Agent',
}

const ROLE_COLOR = {
  super_admin: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
  admin: 'bg-violet-500/15 text-violet-700 dark:text-violet-400 border-violet-500/30',
  marketeur: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-400 border-cyan-500/30',
  branch: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  agent: 'bg-slate-500/15 text-slate-700 dark:text-slate-400 border-slate-500/30',
}

const COMPANIES = [
  { key: 'babait', label: 'Babait' },
  { key: 'aviezer', label: 'Aviezer' },
]

export default function Organisation() {
  const { t } = useI18n()
  const { user: me } = useAuth()
  usePageTitle('Organisation')
  const { actionsContainer } = usePageHeader()

  const { data: users = [], isLoading: lu } = useUsers()
  const { data: branches = [], isLoading: lb } = useBranches()
  const { data: assignments = [] } = useAllUserBranches()

  // Group data by enterprise
  const data = useMemo(() => {
    // Map branch.user_id → enterprise (via the user who owns the branch)
    const userIdToEnterprise = {}
    for (const u of users) {
      if (u.enterprise) userIdToEnterprise[u.id] = u.enterprise
    }
    // Branch users grouped by branch_id
    const usersByBranch = {}
    for (const a of assignments) {
      if (!usersByBranch[a.branch_id]) usersByBranch[a.branch_id] = []
      usersByBranch[a.branch_id].push(a)
    }
    return {
      yedid: {
        admins: users.filter(u => (u.role === 'super_admin' || u.role === 'admin') && !u.enterprise),
        marketeurs: users.filter(u => u.role === 'marketeur'),
      },
      companies: COMPANIES.map(c => ({
        ...c,
        admins: users.filter(u => u.role === 'admin' && u.enterprise === c.key),
        branchUsers: users.filter(u => u.role === 'branch' && u.enterprise === c.key),
        branches: branches
          .filter(b => userIdToEnterprise[b.user_id] === c.key)
          .map(b => ({ ...b, assignedUsers: usersByBranch[b.id] || [] })),
      })),
    }
  }, [users, branches, assignments])

  const [newUser, setNewUser] = useState(null)  // { enterprise, defaultRole }
  const [branchDialog, setBranchDialog] = useState(null)  // { enterprise, edit?: branch }

  if (lu || lb) return <div className="text-muted-foreground">{t('common.loading')}</div>

  const showYedid = !me?.enterprise || me?.role === 'super_admin'

  return (
    <div className="space-y-8 max-w-6xl">
      {showYedid && <YedidSection data={data.yedid} onAddUser={(role) => setNewUser({ enterprise: null, defaultRole: role })} />}

      {data.companies
        .filter(c => !me?.enterprise || me.enterprise === c.key)
        .map(c => (
          <CompanySection
            key={c.key}
            company={c}
            onAddUser={(role) => setNewUser({ enterprise: c.key, defaultRole: role })}
            onAddBranch={() => setBranchDialog({ enterprise: c.key })}
            onEditBranch={(branch) => setBranchDialog({ enterprise: c.key, edit: branch })}
          />
        ))}

      <UserDialog
        config={newUser}
        branches={branches}
        onClose={() => setNewUser(null)}
      />

      <BranchDialog
        config={branchDialog}
        onClose={() => setBranchDialog(null)}
      />

      {actionsContainer && createPortal(<div />, actionsContainer)}
    </div>
  )
}

// ─── Yedid section ───────────────────────────────────────

function YedidSection({ data, onAddUser }) {
  return (
    <section>
      <SectionHeader title="Yedid" subtitle="Acces global" icon={<Crown className="h-4 w-4 text-amber-500" />} />

      <Card>
        <CardContent className="p-4 space-y-4">
          <Group title="Administrateurs" addLabel="Ajouter un admin" onAdd={() => onAddUser('admin')}>
            {data.admins.length === 0 ? (
              <Empty text="Aucun admin global" />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {data.admins.map(u => <UserCard key={u.id} user={u} />)}
              </div>
            )}
          </Group>

          <Group title="Marketeurs" addLabel="Ajouter un marketeur" onAdd={() => onAddUser('marketeur')}>
            {data.marketeurs.length === 0 ? (
              <Empty text="Aucun marketeur" />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {data.marketeurs.map(u => <UserCard key={u.id} user={u} />)}
              </div>
            )}
          </Group>
        </CardContent>
      </Card>
    </section>
  )
}

// ─── Company section (babait / aviezer) ──────────────────

function CompanySection({ company, onAddUser, onAddBranch, onEditBranch }) {
  return (
    <section>
      <SectionHeader
        title={company.label}
        subtitle={`${company.branches.length} branches · ${company.branchUsers.length} users branche · ${company.admins.length} admins`}
        icon={<Building2 className="h-4 w-4 text-violet-500" />}
      />

      <Card>
        <CardContent className="p-4 space-y-4">
          <Group title="Administrateurs societe" addLabel="Ajouter un admin" onAdd={() => onAddUser('admin')}>
            {company.admins.length === 0 ? (
              <Empty text="Aucun admin pour cette societe" />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {company.admins.map(u => <UserCard key={u.id} user={u} />)}
              </div>
            )}
          </Group>

          <Group
            title={`Branches (${company.branches.length})`}
            addLabel="Ajouter une branche"
            onAdd={onAddBranch}
            secondary={
              <Button size="sm" variant="outline" onClick={() => onAddUser('branch')}>
                <UserPlus className="h-3 w-3 me-1" /> User branche
              </Button>
            }
          >
            {company.branches.length === 0 ? (
              <Empty text="Aucune branche" />
            ) : (
              <div className="space-y-1.5">
                {company.branches.map(b => (
                  <BranchRow
                    key={b.id}
                    branch={b}
                    company={company}
                    branchUsers={company.branchUsers}
                    onEdit={() => onEditBranch(b)}
                  />
                ))}
              </div>
            )}
          </Group>
        </CardContent>
      </Card>
    </section>
  )
}

// ─── Branch row (collapsible with user assignments) ──────

function BranchRow({ branch, company, branchUsers, onEdit }) {
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState('')
  const assign = useAssignBranch()
  const unassign = useUnassignBranch()
  const updateBranch = useUpdateBranch()
  const deleteBranch = useDeleteBranch()

  const assignedIds = new Set(branch.assignedUsers.map(a => a.user_id))
  const candidates = branchUsers.filter(u => !assignedIds.has(u.id))

  const handleAssign = () => {
    if (!picked) return
    assign.mutate({ userId: parseInt(picked), branchId: branch.id }, { onSuccess: () => setPicked('') })
  }

  const toggleDispatch = (e) => {
    e.stopPropagation()
    updateBranch.mutate({ id: branch.id, body: { dispatch_enabled: !branch.dispatch_enabled } })
  }

  const phone = branch.phone || branch.mobile

  return (
    <div className="border rounded-md">
      <div
        className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-accent/50"
        onClick={() => setOpen(!open)}
      >
        {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
        <Home className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="font-medium text-sm shrink-0">{branch.name}</span>

        {branch.contact_name && (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={`${nameColor(branch.contact_name)} text-white shrink-0 size-5 rounded-full flex items-center justify-center text-[10px] font-medium`}>
              {branch.contact_name.charAt(0).toUpperCase()}
            </span>
            <span className="truncate max-w-[100px]">{branch.contact_name}</span>
          </span>
        )}

        {phone && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Phone className="h-3 w-3" /> {phone}
          </span>
        )}

        {branch.address && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground truncate max-w-[180px]">
            <MapPin className="h-3 w-3 shrink-0" /> {branch.address}
          </span>
        )}

        {branch.whatsapp_phone && (
          <Badge variant="secondary" className="text-xs gap-1">
            <MessageCircle className="h-3 w-3" /> {branch.whatsapp_phone}
          </Badge>
        )}

        <div className="ms-auto flex items-center gap-2 shrink-0">
          <Badge variant="outline" className="text-xs">
            {branch.assignedUsers.length} user{branch.assignedUsers.length > 1 ? 's' : ''}
          </Badge>
          <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground uppercase">dispatch</span>
            <Switch checked={!!branch.dispatch_enabled} onCheckedChange={() => toggleDispatch({ stopPropagation: () => {} })} className="scale-75" />
          </div>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={(e) => { e.stopPropagation(); onEdit() }}>
            <Pencil className="h-3 w-3" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={(e) => e.stopPropagation()}>
                <X className="h-3 w-3 text-destructive" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Supprimer la branche {branch.name} ?</AlertDialogTitle>
                <AlertDialogDescription>
                  Les leads existants ne seront pas supprimes mais perdront leur branche.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuler</AlertDialogCancel>
                <AlertDialogAction onClick={() => deleteBranch.mutate(branch.id)}>Supprimer</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {open && (
        <div className="px-3 py-2.5 border-t bg-muted/30 space-y-2.5">
          {branch.assignedUsers.length === 0 ? (
            <p className="text-xs text-muted-foreground">Aucun user assigne.</p>
          ) : (
            <div className="space-y-1">
              {branch.assignedUsers.map(a => (
                <div key={a.id} className="flex items-center gap-2 px-2 py-1 bg-background rounded text-sm">
                  <UsersIcon className="h-3 w-3 text-muted-foreground" />
                  <span>{[a.users?.first_name, a.users?.last_name].filter(Boolean).join(' ') || a.users?.email}</span>
                  <span className="text-xs text-muted-foreground ms-1">{a.users?.email}</span>
                  <Button
                    size="sm" variant="ghost" className="ms-auto h-6 w-6 p-0"
                    onClick={() => unassign.mutate({ userId: a.user_id, branchId: branch.id })}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {candidates.length > 0 && (
            <div className="flex gap-2">
              <Select value={picked} onValueChange={setPicked}>
                <SelectTrigger className="h-8 text-xs flex-1"><SelectValue placeholder="Assigner un user branche" /></SelectTrigger>
                <SelectContent>
                  {candidates.map(u => (
                    <SelectItem key={u.id} value={String(u.id)}>
                      {[u.first_name, u.last_name].filter(Boolean).join(' ') || u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" onClick={handleAssign} disabled={!picked || assign.isPending}>
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── User card ───────────────────────────────────────────

function UserCard({ user }) {
  const navigate = useNavigate()
  const deleteUser = useDeleteUser()
  return (
    <div
      className="flex items-center gap-2 px-3 py-2 border rounded-md hover:bg-accent/50 cursor-pointer group"
      onClick={() => navigate(`/users/${user.id}`)}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-sm truncate">
            {[user.first_name, user.last_name].filter(Boolean).join(' ') || user.email}
          </span>
          <Badge variant="outline" className={`text-xs ${ROLE_COLOR[user.role] || ''}`}>
            {ROLE_LABEL[user.role] || user.role}
          </Badge>
        </div>
        <div className="text-xs text-muted-foreground truncate">{user.email}</div>
      </div>
      {user.role !== 'super_admin' && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
              <X className="h-3 w-3 text-destructive" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Supprimer {user.email} ?</AlertDialogTitle>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction onClick={() => deleteUser.mutate(user.id)}>Supprimer</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  )
}

// ─── Generic UI bits ─────────────────────────────────────

function SectionHeader({ title, subtitle, icon }) {
  return (
    <div className="flex items-center gap-2 mb-3 px-1">
      {icon}
      <h2 className="text-base font-semibold">{title}</h2>
      {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
    </div>
  )
}

function Group({ title, addLabel, onAdd, secondary, children }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h3>
        <div className="flex gap-2">
          {secondary}
          {onAdd && (
            <Button size="sm" variant="outline" onClick={onAdd}>
              <Plus className="h-3 w-3 me-1" /> {addLabel}
            </Button>
          )}
        </div>
      </div>
      {children}
    </div>
  )
}

function Empty({ text }) {
  return <p className="text-xs text-muted-foreground italic px-2 py-1.5">{text}</p>
}

// ─── Create User Dialog ──────────────────────────────────

function UserDialog({ config, branches, onClose }) {
  const createUser = useCreateUser()
  const assign = useAssignBranch()
  const [form, setForm] = useState({ email: '', password: '', first_name: '', last_name: '', role: 'admin', enterprise: '' })
  const [pickedBranches, setPickedBranches] = useState([])
  const [error, setError] = useState('')

  if (!config) return null

  const open = !!config
  const enterprise = config.enterprise || ''
  const defaultRole = config.defaultRole || 'admin'

  // Reset form on open
  if (open && form.role === 'admin' && form.enterprise === '' && (defaultRole !== 'admin' || enterprise !== '')) {
    setForm({ ...form, role: defaultRole, enterprise })
  }

  const availableBranches = enterprise
    ? branches.filter(b => {
        // We need enterprise→ownerId; client-side approximation: branches whose user_id matches admin owning that enterprise
        // (already filtered by backend in real fetch; here just show all then assign)
        return true
      })
    : []

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    try {
      const created = await createUser.mutateAsync({
        ...form,
        enterprise: form.enterprise || null,
      })
      // If branch role + branches picked, assign them
      if (form.role === 'branch' && pickedBranches.length) {
        const newId = created.user.id
        for (const bid of pickedBranches) {
          await assign.mutateAsync({ userId: newId, branchId: bid })
        }
      }
      onClose()
      setForm({ email: '', password: '', first_name: '', last_name: '', role: 'admin', enterprise: '' })
      setPickedBranches([])
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nouvel utilisateur</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Prenom</Label>
              <Input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Nom</Label>
              <Input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Email</Label>
            <Input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Mot de passe</Label>
            <Input type="password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Role</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="branch">Sniff (branche)</SelectItem>
                  <SelectItem value="marketeur">Marketeur</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Societe</Label>
              <Select value={form.enterprise || '__none__'} onValueChange={(v) => setForm({ ...form, enterprise: v === '__none__' ? '' : v })}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Aucune (yedid)</SelectItem>
                  <SelectItem value="babait">Babait</SelectItem>
                  <SelectItem value="aviezer">Aviezer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {form.role === 'branch' && form.enterprise && (
            <div className="space-y-1">
              <Label className="text-xs">Branches assignees ({pickedBranches.length})</Label>
              <div className="border rounded-md p-2 max-h-40 overflow-y-auto space-y-1">
                {branches.filter(b => true).map(b => (
                  <label key={b.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-accent/50 px-1 py-0.5 rounded">
                    <input
                      type="checkbox"
                      checked={pickedBranches.includes(b.id)}
                      onChange={(e) => setPickedBranches(prev => e.target.checked ? [...prev, b.id] : prev.filter(x => x !== b.id))}
                    />
                    {b.name}
                  </label>
                ))}
              </div>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
            <Button type="submit" disabled={createUser.isPending}>Creer</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Create Branch Dialog ────────────────────────────────

const emptyBranchForm = { name: '', contact_name: '', email: '', phone: '', mobile: '', address: '', whatsapp_phone: '' }

function BranchDialog({ config, onClose }) {
  const createBranch = useCreateBranch()
  const updateBranch = useUpdateBranch()
  const [form, setForm] = useState(emptyBranchForm)
  const [error, setError] = useState('')
  const [lastEditId, setLastEditId] = useState(null)

  // Load form when opening with edit, reset on close
  if (config?.edit && lastEditId !== config.edit.id) {
    setLastEditId(config.edit.id)
    setForm({
      name: config.edit.name || '',
      contact_name: config.edit.contact_name || '',
      email: config.edit.email || '',
      phone: config.edit.phone || '',
      mobile: config.edit.mobile || '',
      address: config.edit.address || '',
      whatsapp_phone: config.edit.whatsapp_phone || '',
    })
  }
  if (!config && lastEditId !== null) {
    setLastEditId(null)
    setForm(emptyBranchForm)
  }

  if (!config) return null

  const isEdit = !!config.edit

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    try {
      if (isEdit) {
        await updateBranch.mutateAsync({ id: config.edit.id, body: form })
      } else {
        await createBranch.mutateAsync({ ...form, enterprise: config.enterprise })
      }
      onClose()
      setForm(emptyBranchForm)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <Dialog open={!!config} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? `Editer ${config.edit.name}` : `Nouvelle branche · ${config.enterprise}`}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Nom</Label>
            <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Contact</Label>
              <Input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Telephone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Mobile</Label>
              <Input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Adresse</Label>
            <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">WhatsApp dispatch</Label>
            <Input value={form.whatsapp_phone} onChange={(e) => setForm({ ...form, whatsapp_phone: e.target.value })} placeholder="+972..." />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
            <Button type="submit" disabled={createBranch.isPending || updateBranch.isPending}>
              {isEdit ? 'Enregistrer' : 'Creer'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
