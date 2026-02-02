import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useEscalationRulesLibrary, useAgentEscalationRules, useUpdateAgentEscalationRules } from '../../hooks/queries'
import { useI18n } from '../../lib/i18n'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ExternalLink } from 'lucide-react'

export default function EscalationSelectionTab({ agentBotId }) {
  const { t } = useI18n()
  const libraryQuery = useEscalationRulesLibrary()
  const agentRulesQuery = useAgentEscalationRules(agentBotId)
  const updateAssociations = useUpdateAgentEscalationRules(agentBotId)

  const library = libraryQuery.data || []
  const agentRules = agentRulesQuery.data || []
  const isLoading = libraryQuery.isLoading || agentRulesQuery.isLoading

  const initialIds = useMemo(() => agentRules.map(r => r.id), [agentRules])
  const [selectedIds, setSelectedIds] = useState([])
  const [hasChanges, setHasChanges] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setSelectedIds(initialIds)
    setHasChanges(false)
  }, [initialIds])

  const handleToggle = (ruleId) => {
    const newSelection = selectedIds.includes(ruleId)
      ? selectedIds.filter(id => id !== ruleId)
      : [...selectedIds, ruleId]

    setSelectedIds(newSelection)
    setHasChanges(true)
  }

  const handleSave = async () => {
    setError('')
    try {
      await updateAssociations.mutateAsync(selectedIds)
      setHasChanges(false)
    } catch (err) {
      setError(err.message)
    }
  }

  if (isLoading) return <div className="text-muted-foreground">{t('common.loading')}</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">
          {t('escalation.selectionSubtitle')} ({selectedIds.length} {t('common.selected')})
        </p>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to="/escalation">
              <ExternalLink className="me-2 h-4 w-4" />
              {t('escalation.manageLibrary')}
            </Link>
          </Button>
          <Button onClick={handleSave} disabled={!hasChanges || updateAssociations.isPending}>
            {updateAssociations.isPending ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-3 mb-4 text-sm rounded-md bg-destructive/10 text-destructive border border-destructive/20">{error}</div>
      )}

      {library.length === 0 ? (
        <Card className="p-6 text-center">
          <p className="text-muted-foreground mb-4">{t('escalation.emptyLibrary')}</p>
          <Button asChild>
            <Link to="/escalation">{t('escalation.createFirst')}</Link>
          </Button>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">{t('common.active')}</TableHead>
                <TableHead>{t('common.title')}</TableHead>
                <TableHead>Trigger</TableHead>
                <TableHead>{t('common.audience')}</TableHead>
                <TableHead>{t('common.status')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {library.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Switch
                      checked={selectedIds.includes(r.id)}
                      onCheckedChange={() => handleToggle(r.id)}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{r.title}</TableCell>
                  <TableCell className="truncate max-w-[250px]">{r.trigger_description || '-'}</TableCell>
                  <TableCell>{r.audience || '-'}</TableCell>
                  <TableCell>
                    <Badge variant={r.is_active ? 'default' : 'secondary'}>
                      {r.is_active ? t('common.active') : t('common.inactive')}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  )
}
