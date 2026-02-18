import { Navigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { Loader2 } from 'lucide-react'

export function ProtectedRoute({ children, roles }) {
  const { isAuthenticated, loading, user } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  // super_admin inherits admin access
  const hasAccess = roles
    ? roles.includes(user?.role) || (user?.role === 'super_admin' && roles.includes('admin'))
    : true
  if (!hasAccess) {
    return <Navigate to="/" replace />
  }

  return children
}
