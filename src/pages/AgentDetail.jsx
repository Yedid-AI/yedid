import { useParams, useNavigate } from 'react-router-dom'
import { useAgent } from '../hooks/queries'
import { useI18n } from '../lib/i18n'
import { usePageTitle } from '../lib/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ArrowLeft, Settings, BookOpen, Zap } from 'lucide-react'
import ConfigTab from '../components/agent/ConfigTab'
import PlaybooksSelectionTab from '../components/agent/PlaybooksSelectionTab'
import EscalationSelectionTab from '../components/agent/EscalationSelectionTab'

export default function AgentDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t, dateLocale } = useI18n()
  const { data: agent, isLoading, error: queryError } = useAgent(id)
  usePageTitle(agent?.name || '')


  if (isLoading) return <div className="text-muted-foreground">{t('common.loading')}</div>
  if (queryError) return (
    <div>
      <Button variant="ghost" onClick={() => navigate('/agents')} className="mb-4">
        <ArrowLeft className="me-2 h-4 w-4 icon-directional" /> {t('common.back')}
      </Button>
      <div className="p-3 text-sm rounded-md bg-destructive/10 text-destructive border border-destructive/20">{queryError.message}</div>
    </div>
  )

  return (
    <div>
      <div className="flex items-center gap-4 mb-8">
        <Button variant="ghost" size="sm" onClick={() => navigate('/agents')}>
          <ArrowLeft className="me-2 h-4 w-4 icon-directional" /> {t('common.back')}
        </Button>
        <div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t('common.createdAt')} {new Date(agent.created_at).toLocaleDateString(dateLocale)}
          </p>
        </div>
        <Badge variant={agent.is_active ? 'default' : 'secondary'} className="ms-auto">
          {agent.is_active ? t('common.active') : t('common.inactive')}
        </Badge>
      </div>

      <Tabs defaultValue="config">
        <TabsList>
          <TabsTrigger value="config"><Settings className="me-1.5 h-4 w-4" />Config</TabsTrigger>
          <TabsTrigger value="playbooks"><BookOpen className="me-1.5 h-4 w-4" />Playbooks</TabsTrigger>
          <TabsTrigger value="escalation"><Zap className="me-1.5 h-4 w-4" />Escalation</TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="mt-6">
          <ConfigTab agentBotId={id} />
        </TabsContent>

        <TabsContent value="playbooks" className="mt-6">
          <PlaybooksSelectionTab agentBotId={id} />
        </TabsContent>

        <TabsContent value="escalation" className="mt-6">
          <EscalationSelectionTab agentBotId={id} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
