import { useState, useEffect } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { useI18n } from '../../lib/i18n'
import {
  LayoutDashboard, Brain, Sparkles, Radio, Route, Plug, ArrowRightLeft,
  Settings, LogOut, KeyRound, UserPlus, Building2, Phone,
  Moon, Sun, Globe, CalendarClock, ChevronsUpDown, Network, ChevronRight,
  MessageSquare,
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
  useSidebar,
} from '@/components/ui/sidebar'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import logoSrc from '@/assets/logo.png'

/* Grouped navigation. Groups with `labelKey` are collapsible; the lone
 * dashboard entry sits flat above the groups. `ai: true` groups are hidden
 * for company-scoped admins (only super_admin / yedid admin keep them). */
const navGroups = [
  {
    labelKey: null,
    items: [
      { path: '/', labelKey: 'nav.dashboard', icon: LayoutDashboard, roles: ['super_admin', 'admin', 'agent'] },
    ],
  },
  {
    labelKey: 'nav.group.crm',
    defaultOpen: true,
    items: [
      { path: '/leads', labelKey: 'nav.leadsPage', icon: UserPlus, roles: ['admin', 'marketeur', 'branch'] },
      { path: '/chat', labelKey: 'nav.chat', icon: MessageSquare, roles: ['admin', 'agent'] },
      { path: '/calls', labelKey: 'nav.calls', icon: Phone, roles: ['admin'] },
      { path: '/branches', labelKey: 'nav.branches', icon: Route, roles: ['admin', 'branch'] },
    ],
  },
  {
    labelKey: 'nav.group.ai',
    ai: true,
    defaultOpen: true,
    items: [
      { path: '/inboxes', labelKey: 'nav.inboxes', icon: Radio, roles: ['super_admin'] },
      { path: '/agents', labelKey: 'nav.agents', icon: Sparkles, roles: ['super_admin'] },
      { path: '/sources', labelKey: 'nav.knowledge', icon: Brain, roles: ['super_admin'] },
      { path: '/playbooks', labelKey: 'nav.playbooks', icon: Route, roles: ['super_admin'] },
      { path: '/tools', labelKey: 'nav.tools', icon: Plug, roles: ['super_admin'] },
      { path: '/escalation', labelKey: 'nav.escalation', icon: ArrowRightLeft, roles: ['super_admin'] },
    ],
  },
  {
    labelKey: 'nav.group.admin',
    defaultOpen: false,
    items: [
      { path: '/organisation', labelKey: 'nav.organisation', icon: Network, roles: ['admin'] },
      { path: '/settings', labelKey: 'nav.settings', icon: Settings, roles: ['admin'] },
      { path: '/environment', labelKey: 'nav.environment', icon: KeyRound, roles: ['super_admin'] },
      { path: '/closing', labelKey: 'nav.closing', icon: CalendarClock, roles: ['super_admin'] },
    ],
  },
]

const langOrder = ['fr', 'en', 'he']

function GroupSection({ group, items, t, location, isCollapsed }) {
  const storageKey = `sidebar-group:${group.labelKey}`
  const [open, setOpen] = useState(() => {
    if (typeof window === 'undefined') return group.defaultOpen ?? true
    const v = window.localStorage.getItem(storageKey)
    if (v === null) return group.defaultOpen ?? true
    return v === '1'
  })

  useEffect(() => {
    try { window.localStorage.setItem(storageKey, open ? '1' : '0') } catch {}
  }, [open, storageKey])

  const renderItems = () => (
    <SidebarMenu className="gap-1">
      {items.map((item) => {
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
  )

  // In icon-collapsed sidebar mode the group label is hidden — render items
  // directly so the icons stay accessible without forcing the user to expand.
  if (isCollapsed) {
    return <SidebarGroup>{renderItems()}</SidebarGroup>
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="group/collapsible">
      <SidebarGroup>
        <SidebarGroupLabel asChild>
          <CollapsibleTrigger className="flex w-full items-center justify-between cursor-pointer text-sidebar-foreground/70 hover:text-sidebar-foreground transition-colors">
            <span>{t(group.labelKey)}</span>
            <ChevronRight
              size={14}
              className={`transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
            />
          </CollapsibleTrigger>
        </SidebarGroupLabel>
        <CollapsibleContent>
          {renderItems()}
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  )
}

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

  // Hide AI groups for company admins (enterprise scoped) — only super_admin / yedid admin keep them
  const isCompanyScoped = !!user?.enterprise && user?.role !== 'super_admin'

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

      {/* Navigation — grouped + collapsible */}
      <SidebarContent>
        {navGroups.map((group, gi) => {
          if (group.ai && isCompanyScoped) return null
          const visibleItems = group.items.filter(hasAccess)
          if (visibleItems.length === 0) return null

          // Flat group (no label, no collapsible) — used for Dashboard
          if (!group.labelKey) {
            return (
              <SidebarGroup key={gi}>
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
          }

          return (
            <GroupSection
              key={gi}
              group={group}
              items={visibleItems}
              t={t}
              location={location}
              isCollapsed={isCollapsed}
            />
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
