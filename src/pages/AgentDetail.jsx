import { useParams, useNavigate } from 'react-router-dom'
import { useAgent } from '../hooks/queries'
import { useI18n } from '../lib/i18n'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ArrowLeft, Settings, BookOpen, Wrench, Zap } from 'lucide-react'
import ConfigTab from '../components/agent/ConfigTab'
import PlaybooksTab from '../components/agent/PlaybooksTab'
import ToolsTab from '../components/agent/ToolsTab'
import EscalationTab from '../components/agent/EscalationTab'

export default function AgentDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t, dateLocale } = useI18n()
  const { data: agent, isLoading, error: queryError } = useAgent(id)

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
          <h1 className="text-2xl font-semibold tracking-tight">{agent.name}</h1>
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
          <TabsTrigger value="tools"><Wrench className="me-1.5 h-4 w-4" />Tools</TabsTrigger>
          <TabsTrigger value="escalation"><Zap className="me-1.5 h-4 w-4" />Escalation</TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="mt-6">
          <ConfigTab agentBotId={id} />
        </TabsContent>

        <TabsContent value="playbooks" className="mt-6">
          <PlaybooksTab agentBotId={id} />
        </TabsContent>

        <TabsContent value="tools" className="mt-6">
          <ToolsTab agentBotId={id} />
        </TabsContent>

        <TabsContent value="escalation" className="mt-6">
          <EscalationTab agentBotId={id} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
