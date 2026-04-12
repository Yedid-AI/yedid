import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { useI18n } from '../../lib/i18n'
import {
  LayoutDashboard, Brain, Sparkles, Radio, Route, Plug, ArrowRightLeft,
  Users, Settings, LogOut, KeyRound, UserPlus, Building2, Phone,
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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from '@/components/ui/sidebar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import logoSrc from '@/assets/logo.png'

/* Grouped navigation structure */
const navGroups = [
  {
    labelKey: null,
    items: [
      { path: '/', labelKey: 'nav.dashboard', icon: LayoutDashboard, roles: ['super_admin', 'admin', 'agent'] },
    ],
  },
  {
    labelKey: 'nav.workspace',
    ai: true, // AI section — hidden for admin
    items: [
      { path: '/inboxes', labelKey: 'nav.inboxes', icon: Radio, roles: ['super_admin'] },
      { path: '/agents', labelKey: 'nav.agents', icon: Sparkles, roles: ['super_admin'] },
      { path: '/sources', labelKey: 'nav.knowledge', icon: Brain, roles: ['super_admin'] },
    ],
  },
  {
    labelKey: 'nav.leads',
    items: [
      { path: '/leads', labelKey: 'nav.leadsPage', icon: UserPlus, roles: ['admin', 'marketeur'] },
      { path: '/branches', labelKey: 'nav.branches', icon: Building2, roles: ['admin'] },
      { path: '/calls', labelKey: 'nav.calls', icon: Phone, roles: ['admin'] },
    ],
  },
  {
    labelKey: 'nav.configure',
    ai: true,
    items: [
      { path: '/playbooks', labelKey: 'nav.playbooks', icon: Route, roles: ['super_admin'] },
      { path: '/escalation', labelKey: 'nav.escalation', icon: ArrowRightLeft, roles: ['super_admin'] },
      { path: '/tools', labelKey: 'nav.tools', icon: Plug, roles: ['super_admin'] },
    ],
  },
  {
    labelKey: 'nav.settings',
    items: [
      { path: '/settings', labelKey: 'nav.settings', icon: Settings, roles: ['admin'] },
      { path: '/users', labelKey: 'nav.users', icon: Users, roles: ['admin'] },
    ],
  },
  {
    labelKey: 'nav.platform',
    items: [
      { path: '/environment', labelKey: 'nav.environment', icon: KeyRound, roles: ['super_admin'] },
      { path: '/closing', labelKey: 'nav.closing', icon: CalendarClock, roles: ['super_admin'] },
    ],
  },
]

const langOrder = ['fr', 'en', 'he']

export function AppSidebar() {
  const { user, logout } = useAuth()
  const { dark, toggle } = useTheme()
  const { t, locale, setLocale, dir } = useI18n()
  const navigate = useNavigate()
  const location = useLocation()
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

  const hasAccess = (item) =>
    item.roles.includes(user?.role) || (user?.role === 'super_admin' && item.roles.includes('admin'))

  return (
    <SidebarRoot variant="floating" collapsible="icon" side={dir === 'rtl' ? 'right' : 'left'}>
      {/* Header — Logo */}
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <NavLink to="/">
                <img src={logoSrc} alt="Yedid AI" className="h-8 w-auto" />
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-semibold">Yedid AI</span>
                  <span className="text-xs">{user?.enterprise || t('nav.dashboard')}</span>
                </div>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      {/* Navigation — grouped */}
      <SidebarContent>
        {navGroups.map((group, gi) => {
          const visibleItems = group.items.filter(hasAccess)
          if (visibleItems.length === 0) return null
          return (
            <SidebarGroup key={gi}>
              {group.labelKey && (
                <SidebarGroupLabel>{t(group.labelKey)}</SidebarGroupLabel>
              )}
              <SidebarMenu className="gap-1">
                {visibleItems.map((item) => {
                  const Icon = item.icon
                  const isActive = item.path === '/'
                    ? location.pathname === '/'
                    : location.pathname.startsWith(item.path)
                  return (
                    <SidebarMenuItem key={item.path}>
                      <SidebarMenuButton asChild isActive={isActive} tooltip={t(item.labelKey)}>
                        <NavLink to={item.path} end={item.path === '/'}>
                          <Icon size={16} strokeWidth={1.8} />
                          <span>{t(item.labelKey)}</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroup>
          )
        })}
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
                  <div className="bg-sidebar-primary/20 text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg text-xs font-medium uppercase">
                    {(user?.first_name?.[0] || user?.email?.[0] || '?')}
                  </div>
                  <div className="grid flex-1 text-start text-sm leading-tight">
                    <span className="truncate font-medium">{user?.first_name || user?.email}</span>
                    <span className="truncate text-xs opacity-70">{user?.email}</span>
                  </div>
                  <ChevronsUpDown className="ms-auto size-4" />
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
    </SidebarRoot>
  )
}
