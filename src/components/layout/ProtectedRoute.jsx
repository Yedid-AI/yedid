import { Navigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { Loader2 } from 'lucide-react'

export function ProtectedRoute({ children, roles, noEnterprise }) {
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

  // Routes flagged noEnterprise (AI features) are only for yedid-side users
  if (noEnterprise && user?.role !== 'super_admin' && user?.enterprise) {
    return <Navigate to="/" replace />
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
