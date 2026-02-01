import { useParams, useNavigate } from 'react-router-dom'
import { useI18n } from '../lib/i18n'
import { useSession, useSessionMessages } from '../hooks/queries'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, User, Bot } from 'lucide-react'

export default function SessionDetail() {
  const { id } = useParams()
  const { t, dateLocale } = useI18n()
  const navigate = useNavigate()
  const { data: session, isLoading: sessionLoading } = useSession(id)
  const { data: messages = [], isLoading: messagesLoading } = useSessionMessages(id)

  const loading = sessionLoading || messagesLoading

  if (loading) return <div className="text-muted-foreground">{t('common.loading')}</div>
  if (!session) return <div className="text-muted-foreground">{t('sessions.notFound')}</div>

  return (
    <div>
      <div className="flex items-center gap-4 mb-8">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('sessions.detail')}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t('sessions.sessionId', { id: String(session.id).slice(0, 8) })} — {new Date(session.created_at).toLocaleString(dateLocale)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">{t('common.status')}</div>
            <Badge variant={session.status === 'open' ? 'default' : 'secondary'} className="mt-1">
              {session.status === 'open' ? t('sessions.statusOpen') : t('sessions.statusClosed')}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">{t('sessions.billableCol')}</div>
            <div className="text-lg font-semibold mt-1">{session.billable ? t('common.yes') : t('common.no')}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">{t('sessions.confidence')}</div>
            <div className="text-lg font-semibold mt-1">
              {session.ai_confidence != null ? `${Math.round(session.ai_confidence * 100)}%` : '-'}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">{t('sessions.messages')}</div>
            <div className="text-lg font-semibold mt-1">{messages.length}</div>
          </CardContent>
        </Card>
      </div>

      {session.ai_reason && (
        <Card className="mb-6">
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground mb-1">{t('sessions.aiReason')}</div>
            <p className="text-sm">{session.ai_reason}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('sessions.conversation')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {messages.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('sessions.noMessages')}</p>
          ) : (
            messages.map((m) => (
              <div key={m.id} className="flex gap-3">
                <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${m.role === 'user' ? 'bg-muted' : 'bg-primary/10'}`}>
                  {m.role === 'user' ? <User size={14} /> : <Bot size={14} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-medium">{m.role === 'user' ? 'Client' : 'Agent'}</span>
                    <span className="text-xs text-muted-foreground">{new Date(m.created_at).toLocaleString(dateLocale)}</span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{m.content}</p>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
