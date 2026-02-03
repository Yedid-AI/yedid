import { useState } from 'react'
import { useSources, useCreateSource, useDeleteSource } from '../hooks/queries'
import { useI18n } from '../lib/i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { LayoutGrid, List, FileText, Globe as GlobeIcon } from 'lucide-react'

const statusVariant = {
  pending: 'secondary',
  processing: 'outline',
  complete: 'default',
  error: 'destructive',
}

export default function Sources() {
  const { t, dateLocale } = useI18n()
  const { data: sources = [], isLoading, error: queryError } = useSources()
  const createSource = useCreateSource()
  const deleteSource = useDeleteSource()
  const [tab, setTab] = useState('file')
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [file, setFile] = useState(null)
  const [viewMode, setViewMode] = useState('card')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const displayError = error || queryError?.message || ''

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const body = { type: tab, name }
      if (tab === 'webpage') {
        body.url = url
      } else if (tab === 'file' && file) {
        const buffer = await file.arrayBuffer()
        body.file_base64 = btoa(
          new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
        )
      }
      await createSource.mutateAsync(body)
      setName('')
      setUrl('')
      setFile(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id) => {
    try {
      await deleteSource.mutateAsync(id)
    } catch (err) {
      setError(err.message)
    }
  }

  if (isLoading) return <div className="text-muted-foreground">{t('common.loading')}</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('sources.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('sources.subtitle')}</p>
        </div>
        <div className="flex items-center gap-0.5 border rounded-lg p-0.5">
          <button className={`p-1.5 rounded-md transition-colors ${viewMode === 'card' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'}`} onClick={() => setViewMode('card')}>
            <LayoutGrid size={14} />
          </button>
          <button className={`p-1.5 rounded-md transition-colors ${viewMode === 'table' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'}`} onClick={() => setViewMode('table')}>
            <List size={14} />
          </button>
        </div>
      </div>

      {displayError && (
        <div className="p-3 mb-4 text-sm rounded-md bg-destructive/10 text-destructive border border-destructive/20">
          {displayError}
        </div>
      )}

      <Card className="p-4 mb-6">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="file">{t('sources.uploadPdf')}</TabsTrigger>
            <TabsTrigger value="webpage">{t('sources.webpage')}</TabsTrigger>
          </TabsList>
          <form onSubmit={handleSubmit} className="mt-4 flex gap-3 items-end">
            <div className="flex-1 space-y-2">
              <Label>{t('sources.nameLabel')}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('sources.namePlaceholder')} required />
            </div>
            <TabsContent value="file" className="flex-1 mt-0 space-y-2">
              <Label>{t('sources.fileLabel')}</Label>
              <Input type="file" accept=".pdf" onChange={(e) => setFile(e.target.files[0])} required={tab === 'file'} />
            </TabsContent>
            <TabsContent value="webpage" className="flex-1 mt-0 space-y-2">
              <Label>{t('sources.urlLabel')}</Label>
              <Input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." required={tab === 'webpage'} />
            </TabsContent>
            <Button type="submit" disabled={submitting}>
              {submitting ? t('sources.submitting') : t('sources.submit')}
            </Button>
          </form>
        </Tabs>
      </Card>

      {viewMode === 'card' ? (
        sources.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">{t('sources.empty')}</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sources.map((s) => {
              const TypeIcon = s.type === 'file' ? FileText : GlobeIcon
              return (
                <Card key={s.id} className="hover:shadow-soft-md transition-all py-0 gap-0">
                  <div className="p-[15px]">
                    <div className="flex items-center gap-2.5 mb-2">
                      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 text-primary shrink-0">
                        <TypeIcon size={16} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-sm truncate leading-tight">{s.name}</h3>
                        <span className="text-[11px] text-muted-foreground">{s.type === 'file' ? 'PDF' : 'Web'}</span>
                      </div>
                      <Badge variant={statusVariant[s.status]} className={`shrink-0 ${s.status === 'processing' ? 'animate-pulse' : ''}`}>
                        {s.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground mb-2.5">
                      <span>{t('sources.chunks')}: <span className="font-medium text-foreground">{s.chunk_count}</span></span>
                      <span>{new Date(s.created_at).toLocaleDateString(dateLocale)}</span>
                      {s.error_message && (
                        <span className="text-destructive" title={s.error_message}>(?)</span>
                      )}
                    </div>
                    <div className="flex items-center justify-end gap-1 border-t pt-2 -mx-1">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive">{t('common.delete')}</Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{t('sources.deleteTitle')}</AlertDialogTitle>
                            <AlertDialogDescription>{t('sources.deleteDescription')}</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                            <AlertDialogAction variant="destructive" onClick={() => handleDelete(s.id)}>{t('common.delete')}</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        )
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('common.name')}</TableHead>
                <TableHead>{t('sources.type')}</TableHead>
                <TableHead>{t('common.status')}</TableHead>
                <TableHead>{t('sources.chunks')}</TableHead>
                <TableHead>{t('common.date')}</TableHead>
                <TableHead>{t('common.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sources.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">{t('sources.empty')}</TableCell></TableRow>
              ) : (
                sources.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell>{s.type === 'file' ? 'PDF' : 'Web'}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant[s.status]} className={s.status === 'processing' ? 'animate-pulse' : ''}>
                        {s.status}
                      </Badge>
                      {s.error_message && (
                        <span className="ms-2 text-xs text-destructive" title={s.error_message}>(?)</span>
                      )}
                    </TableCell>
                    <TableCell>{s.chunk_count}</TableCell>
                    <TableCell className="text-muted-foreground">{new Date(s.created_at).toLocaleDateString(dateLocale)}</TableCell>
                    <TableCell>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="ghost" className="text-destructive">{t('common.delete')}</Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{t('sources.deleteTitle')}</AlertDialogTitle>
                            <AlertDialogDescription>{t('sources.deleteDescription')}</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                            <AlertDialogAction variant="destructive" onClick={() => handleDelete(s.id)}>{t('common.delete')}</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  )
}
