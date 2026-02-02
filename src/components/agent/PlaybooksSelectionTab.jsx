import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { usePlaybooksLibrary, useAgentPlaybooks, useUpdateAgentPlaybooks } from '../../hooks/queries'
import { useI18n } from '../../lib/i18n'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ExternalLink } from 'lucide-react'

export default function PlaybooksSelectionTab({ agentBotId }) {
  const { t } = useI18n()
  const libraryQuery = usePlaybooksLibrary()
  const agentPlaybooksQuery = useAgentPlaybooks(agentBotId)
  const updateAssociations = useUpdateAgentPlaybooks(agentBotId)

  const library = libraryQuery.data || []
  const agentPlaybooks = agentPlaybooksQuery.data || []
  const isLoading = libraryQuery.isLoading || agentPlaybooksQuery.isLoading

  const selectedIds = useMemo(() => agentPlaybooks.map(pb => pb.id), [agentPlaybooks])

  const handleToggle = (playbookId) => {
    const newSelection = selectedIds.includes(playbookId)
      ? selectedIds.filter(id => id !== playbookId)
      : [...selectedIds, playbookId]

    updateAssociations.mutate(newSelection)
  }

  if (isLoading) return <div className="text-muted-foreground">{t('common.loading')}</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">
          {t('playbooks.selectionSubtitle')} ({selectedIds.length} {t('common.selected')})
        </p>
        <Button variant="outline" asChild>
          <Link to="/playbooks">
            <ExternalLink className="me-2 h-4 w-4" />
            {t('playbooks.manageLibrary')}
          </Link>
        </Button>
      </div>

      {updateAssociations.isError && (
        <div className="p-3 mb-4 text-sm rounded-md bg-destructive/10 text-destructive border border-destructive/20">
          {updateAssociations.error?.message}
        </div>
      )}

      {library.length === 0 ? (
        <Card className="p-6 text-center">
          <p className="text-muted-foreground mb-4">{t('playbooks.emptyLibrary')}</p>
          <Button asChild>
            <Link to="/playbooks">{t('playbooks.createFirst')}</Link>
          </Button>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">{t('common.active')}</TableHead>
                <TableHead>{t('common.title')}</TableHead>
                <TableHead>{t('common.audience')}</TableHead>
                <TableHead>{t('playbooks.tool')}</TableHead>
                <TableHead>{t('common.status')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {library.map((pb) => (
                <TableRow key={pb.id}>
                  <TableCell>
                    <Switch
                      checked={selectedIds.includes(pb.id)}
                      onCheckedChange={() => handleToggle(pb.id)}
                      disabled={updateAssociations.isPending}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{pb.title}</TableCell>
                  <TableCell>{pb.audience || '-'}</TableCell>
                  <TableCell>{pb.tools?.name || '-'}</TableCell>
                  <TableCell>
                    <Badge variant={pb.is_active ? 'default' : 'secondary'}>
                      {pb.is_active ? t('common.active') : t('common.inactive')}
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
