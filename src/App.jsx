import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './lib/query'
import { ThemeProvider } from './lib/theme'
import { I18nProvider } from './lib/i18n'
import { AuthProvider } from './lib/auth'
import { ProtectedRoute } from './components/layout/ProtectedRoute'
import { Sidebar } from './components/layout/Sidebar'
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

function AppLayout({ children }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="max-w-5xl mx-auto px-8 py-8">
          {children}
        </div>
      </main>
    </div>
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
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
    </QueryClientProvider>
    </I18nProvider>
    </ThemeProvider>
  )
}
