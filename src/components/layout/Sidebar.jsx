import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { useI18n } from '../../lib/i18n'
import {
  LayoutDashboard, Database, Bot, Inbox, BookOpen, Wrench, Zap,
  Users, Settings, LogOut, KeyRound,
  Moon, Sun, Globe, CalendarClock, ChevronsUpDown,
} from 'lucide-react'
import { useTheme } from '../../lib/theme'
import {
  Sidebar as SidebarRoot,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import logoSrc from '@/assets/logo-yedid.png'

const navItems = [
  { path: '/', labelKey: 'nav.dashboard', icon: LayoutDashboard, roles: ['super_admin', 'admin', 'agent'] },
  { path: '/inboxes', labelKey: 'nav.inboxes', icon: Inbox, roles: ['admin'] },
  { path: '/agents', labelKey: 'nav.agents', icon: Bot, roles: ['admin'] },
  { path: '/sources', labelKey: 'nav.knowledge', icon: Database, roles: ['admin'] },
  { path: '/playbooks', labelKey: 'nav.playbooks', icon: BookOpen, roles: ['admin'] },
  { path: '/escalation', labelKey: 'nav.escalation', icon: Zap, roles: ['admin'] },
  { path: '/tools', labelKey: 'nav.tools', icon: Wrench, roles: ['admin'] },
  { path: '/settings', labelKey: 'nav.settings', icon: Settings, roles: ['admin'] },
  { path: '/users', labelKey: 'nav.users', icon: Users, roles: ['super_admin'] },
  { path: '/environment', labelKey: 'nav.environment', icon: KeyRound, roles: ['super_admin'] },
  { path: '/closing', labelKey: 'nav.closing', icon: CalendarClock, roles: ['super_admin'] },
]

const langOrder = ['fr', 'en', 'he']

export function AppSidebar() {
  const { user, logout } = useAuth()
  const { dark, toggle } = useTheme()
  const { t, locale, setLocale, dir } = useI18n()
  const navigate = useNavigate()
  const { state } = useSidebar()
  const isCollapsed = state === 'collapsed'

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const cycleLang = () => {
    const idx = langOrder.indexOf(locale)
    setLocale(langOrder[(idx + 1) % langOrder.length])
  }

  const visibleItems = navItems.filter((item) =>
    item.roles.includes(user?.role) || (user?.role === 'super_admin' && item.roles.includes('admin'))
  )

  return (
    <SidebarRoot variant="inset" collapsible="icon" side={dir === 'rtl' ? 'right' : 'left'}>
      {/* Header — Logo */}
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <NavLink to="/">
                <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                  <img src={logoSrc} alt="Yedid AI" className="size-5" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">Yedid AI</span>
                  <span className="truncate text-xs text-sidebar-foreground">{user?.enterprise || 'Dashboard'}</span>
                </div>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      {/* Navigation */}
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t('nav.menu') || 'Menu'}</SidebarGroupLabel>
          <SidebarMenu>
            {visibleItems.map((item) => {
              const Icon = item.icon
              return (
                <SidebarMenuItem key={item.path}>
                  <SidebarMenuButton asChild tooltip={t(item.labelKey)}>
                    <NavLink
                      to={item.path}
                      end={item.path === '/'}
                      className={({ isActive }) => isActive ? 'font-medium' : ''}
                      data-active={undefined}
                    >
                      {({ isActive }) => (
                        <>
                          <Icon size={16} strokeWidth={1.8} />
                          <span>{t(item.labelKey)}</span>
                          {isActive && <span className="sr-only">(active)</span>}
                        </>
                      )}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer — User menu */}
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <div className="bg-sidebar-accent text-sidebar-accent-foreground flex aspect-square size-8 items-center justify-center rounded-lg text-xs font-medium uppercase">
                    {(user?.first_name?.[0] || user?.email?.[0] || '?')}
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{user?.first_name || user?.email}</span>
                    <span className="truncate text-xs">{user?.email}</span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
                side={isCollapsed ? 'right' : 'top'}
                align="end"
                sideOffset={4}
              >
                <DropdownMenuItem onClick={toggle}>
                  {dark ? <Sun size={14} /> : <Moon size={14} />}
                  {dark ? t('nav.lightMode') : t('nav.darkMode')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={cycleLang}>
                  <Globe size={14} />
                  {locale.toUpperCase()}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut size={14} />
                  {t('nav.logout')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </SidebarRoot>
  )
}
