import { createContext, useCallback, useContext, useState } from 'react'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'

// Lightweight in-house toast system. We don't pull in `sonner` or another library
// because nothing else in the app needed one and adding a dep just to surface error
// messages is overkill. Mount <ToastProvider> once near the app root, then call
// useToast() anywhere to push success/error/info notifications.

const ToastContext = createContext(null)

const VARIANTS = {
  success: { icon: CheckCircle2, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900' },
  error:   { icon: AlertCircle,  color: 'text-red-600 dark:text-red-400',         bg: 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900' },
  info:    { icon: Info,          color: 'text-sky-600 dark:text-sky-400',         bg: 'bg-sky-50 dark:bg-sky-950/40 border-sky-200 dark:border-sky-900' },
}

let nextId = 1

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback(({ title, description, variant = 'info', durationMs = 5000 }) => {
    const id = nextId++
    setToasts((prev) => [...prev, { id, title, description, variant }])
    if (durationMs > 0) setTimeout(() => dismiss(id), durationMs)
    return id
  }, [dismiss])

  const value = {
    toast,
    success: (msg, opts) => toast({ title: msg, variant: 'success', ...opts }),
    error:   (msg, opts) => toast({ title: msg, variant: 'error',   ...opts }),
    info:    (msg, opts) => toast({ title: msg, variant: 'info',    ...opts }),
    dismiss,
  }

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none max-w-sm w-full">
        {toasts.map((t) => {
          const v = VARIANTS[t.variant] || VARIANTS.info
          const Icon = v.icon
          return (
            <div
              key={t.id}
              role="status"
              className={cn(
                'pointer-events-auto rounded-md border shadow-md p-3 flex gap-2 items-start text-sm animate-in fade-in slide-in-from-top-2',
                v.bg
              )}
            >
              <Icon className={cn('size-5 shrink-0 mt-0.5', v.color)} />
              <div className="flex-1 min-w-0">
                {t.title && <div className="font-medium text-foreground break-words">{t.title}</div>}
                {t.description && <div className="text-xs text-muted-foreground mt-0.5 break-words">{t.description}</div>}
              </div>
              <button
                onClick={() => dismiss(t.id)}
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Dismiss"
              >
                <X className="size-4" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}
