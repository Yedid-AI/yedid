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
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">{t('sources.title')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('sources.subtitle')}</p>
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
    </div>
  )
}
