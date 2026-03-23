import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './lib/query'
import { ThemeProvider } from './lib/theme'
import { I18nProvider } from './lib/i18n'
import { AuthProvider } from './lib/auth'
import { ProtectedRoute } from './components/layout/ProtectedRoute'
import { AppSidebar } from './components/layout/Sidebar'
import { SidebarProvider, SidebarInset, SidebarTrigger } from './components/ui/sidebar'
import { Separator } from './components/ui/separator'
import { PageHeaderProvider, usePageHeader } from './lib/page-header'
import { SidePanelProvider, useSidePanel } from './lib/side-panel'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Sources from './pages/Sources'
import Agents from './pages/Agents'
import AgentDetail from './pages/AgentDetail'
import Inboxes from './pages/Inboxes'
import InboxDetail from './pages/InboxDetail'
import Users from './pages/Users'
import UserDetail from './pages/UserDetail'
import Settings from './pages/Settings'
import Environment from './pages/Environment'
import Closing from './pages/Closing'
import SessionDetail from './pages/SessionDetail'
import PlaybooksLibrary from './pages/PlaybooksLibrary'
import ToolsLibrary from './pages/ToolsLibrary'
import EscalationLibrary from './pages/EscalationLibrary'
import Leads from './pages/Leads'
import Branches from './pages/Branches'
import Calls from './pages/Calls'

function AppHeader() {
  const { title, setActionsContainer } = usePageHeader()
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />
      {title && <h1 className="text-sm font-medium">{title}</h1>}
      <div className="ml-auto flex items-center gap-2" ref={setActionsContainer} />
    </header>
  )
}

function ContentWithPanel({ children }) {
  const { isOpen, setPanelContainer } = useSidePanel()
  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      <div className={`min-w-0 overflow-auto px-6 py-6 transition-[flex] duration-300 ease-in-out ${isOpen ? 'flex-1' : 'flex-1'}`}>
        {children}
      </div>
      <div
        ref={setPanelContainer}
        className={`shrink-0 border-l bg-background overflow-hidden transition-[width] duration-300 ease-in-out ${isOpen ? 'w-1/2' : 'w-0'}`}
      />
    </div>
  )
}

function AppLayout({ children }) {
  return (
    <SidebarProvider className="max-h-svh">
      <AppSidebar />
      <SidebarInset className="min-h-0 overflow-hidden">
        <SidePanelProvider>
          <PageHeaderProvider>
            <AppHeader />
            <ContentWithPanel>
              {children}
            </ContentWithPanel>
          </PageHeaderProvider>
        </SidePanelProvider>
      </SidebarInset>
    </SidebarProvider>
  )
}

export default function App() {
  return (
    <ThemeProvider>
    <I18nProvider>
    <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={
            <ProtectedRoute>
              <AppLayout><Dashboard /></AppLayout>
            </ProtectedRoute>
          } />
          <Route path="/agents" element={
            <ProtectedRoute roles={['admin']}>
              <AppLayout><Agents /></AppLayout>
            </ProtectedRoute>
          } />
          <Route path="/agents/:id" element={
            <ProtectedRoute roles={['admin']}>
              <AppLayout><AgentDetail /></AppLayout>
            </ProtectedRoute>
          } />
          <Route path="/inboxes" element={
            <ProtectedRoute roles={['admin']}>
              <AppLayout><Inboxes /></AppLayout>
            </ProtectedRoute>
          } />
          <Route path="/inboxes/:id" element={
            <ProtectedRoute roles={['admin']}>
              <AppLayout><InboxDetail /></AppLayout>
            </ProtectedRoute>
          } />
          <Route path="/sessions/:id" element={
            <ProtectedRoute roles={['admin']}>
              <AppLayout><SessionDetail /></AppLayout>
            </ProtectedRoute>
          } />
          <Route path="/playbooks" element={
            <ProtectedRoute roles={['admin']}>
              <AppLayout><PlaybooksLibrary /></AppLayout>
            </ProtectedRoute>
          } />
          <Route path="/tools" element={
            <ProtectedRoute roles={['admin']}>
              <AppLayout><ToolsLibrary /></AppLayout>
            </ProtectedRoute>
          } />
          <Route path="/escalation" element={
            <ProtectedRoute roles={['admin']}>
              <AppLayout><EscalationLibrary /></AppLayout>
            </ProtectedRoute>
          } />
          <Route path="/sources" element={
            <ProtectedRoute roles={['admin']}>
              <AppLayout><Sources /></AppLayout>
            </ProtectedRoute>
          } />
          <Route path="/users" element={
            <ProtectedRoute roles={['super_admin']}>
              <AppLayout><Users /></AppLayout>
            </ProtectedRoute>
          } />
          <Route path="/users/:id" element={
            <ProtectedRoute roles={['super_admin']}>
              <AppLayout><UserDetail /></AppLayout>
            </ProtectedRoute>
          } />
          <Route path="/settings" element={
            <ProtectedRoute roles={['admin']}>
              <AppLayout><Settings /></AppLayout>
            </ProtectedRoute>
          } />
          <Route path="/environment" element={
            <ProtectedRoute roles={['super_admin']}>
              <AppLayout><Environment /></AppLayout>
            </ProtectedRoute>
          } />
          <Route path="/closing" element={
            <ProtectedRoute roles={['super_admin']}>
              <AppLayout><Closing /></AppLayout>
            </ProtectedRoute>
          } />
          <Route path="/leads" element={
            <ProtectedRoute roles={['admin']}>
              <AppLayout><Leads /></AppLayout>
            </ProtectedRoute>
          } />
          <Route path="/branches" element={
            <ProtectedRoute roles={['admin']}>
              <AppLayout><Branches /></AppLayout>
            </ProtectedRoute>
          } />
          <Route path="/calls" element={
            <ProtectedRoute roles={['admin']}>
              <AppLayout><Calls /></AppLayout>
            </ProtectedRoute>
          } />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
    </QueryClientProvider>
    </I18nProvider>
    </ThemeProvider>
  )
}
