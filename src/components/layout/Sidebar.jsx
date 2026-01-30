import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import {
  LayoutDashboard, Database, Bot, Inbox,
  Users, Settings, LogOut, PanelLeftClose, PanelLeftOpen, KeyRound,
  Moon, Sun,
} from 'lucide-react'
import { useTheme } from '../../lib/theme'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard, roles: ['super_admin', 'admin', 'agent'] },
  { path: '/agents', label: 'Agents', icon: Bot, roles: ['admin'] },
  { path: '/inboxes', label: 'Inboxes', icon: Inbox, roles: ['admin'] },
  { path: '/sources', label: 'Connaissances', icon: Database, roles: ['admin'] },
  { path: '/settings', label: 'Settings', icon: Settings, roles: ['admin'] },
  { path: '/users', label: 'Utilisateurs', icon: Users, roles: ['super_admin'] },
  { path: '/environment', label: 'Environnement', icon: KeyRound, roles: ['super_admin'] },
]

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const { user, logout } = useAuth()
  const { dark, toggle } = useTheme()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const visibleItems = navItems.filter((item) => item.roles.includes(user?.role))

  return (
    <aside
      className="bg-sidebar border-r border-sidebar-border shadow-soft-sm flex flex-col h-screen shrink-0 transition-all duration-200"
      style={{ width: collapsed ? 60 : 224 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-4" style={{ minHeight: 56 }}>
        {!collapsed && (
          <span className="text-base font-semibold tracking-tight text-sidebar-active pl-2">cardynal</span>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(!collapsed)}
          className="h-8 w-8 text-sidebar-foreground hover:text-sidebar-active hover:bg-sidebar-hover shrink-0"
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </Button>
      </div>

      <Separator className="bg-sidebar-border" />

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {visibleItems.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              title={collapsed ? item.label : undefined}
              className={({ isActive }) =>
                `flex items-center rounded-md transition-all duration-150 ${
                  collapsed ? 'justify-center px-0 py-2' : 'gap-3 px-3 py-2'
                } text-[13px] ${
                  isActive
                    ? 'bg-sidebar-hover text-sidebar-active font-medium'
                    : 'text-sidebar-foreground hover:text-sidebar-active hover:bg-sidebar-hover'
                }`
              }
            >
              <Icon size={16} strokeWidth={1.8} className="shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          )
        })}
      </nav>

      <Separator className="bg-sidebar-border" />

      {/* User */}
      <div className={`py-4 ${collapsed ? 'px-2 flex flex-col items-center' : 'px-4'}`}>
        {!collapsed && (
          <>
            <div className="text-[13px] text-sidebar-active truncate">{user?.first_name || user?.email}</div>
            <div className="text-[11px] text-sidebar-foreground truncate mt-0.5">{user?.email}</div>
          </>
        )}
        <div className={`flex ${collapsed ? 'flex-col items-center gap-2 mt-2' : 'items-center gap-3 mt-3'}`}>
          <button
            onClick={handleLogout}
            title="Deconnexion"
            className={`flex items-center text-[12px] text-sidebar-foreground hover:text-sidebar-active transition-colors ${
              collapsed ? 'justify-center' : 'gap-2'
            }`}
          >
            <LogOut size={14} strokeWidth={1.8} />
            {!collapsed && <span>Deconnexion</span>}
          </button>
          <button
            onClick={toggle}
            title={dark ? 'Mode clair' : 'Mode sombre'}
            className="text-sidebar-foreground hover:text-sidebar-active transition-colors"
          >
            {dark ? <Sun size={14} strokeWidth={1.8} /> : <Moon size={14} strokeWidth={1.8} />}
          </button>
        </div>
      </div>
    </aside>
  )
}
