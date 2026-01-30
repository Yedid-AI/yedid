import { useState, useEffect, useRef } from 'react'
import { api } from '../lib/api'
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
  const [sources, setSources] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('file')
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [file, setFile] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const pollRef = useRef(null)

  const fetchSources = async () => {
    try {
      const data = await api.get('/sources')
      setSources(data.sources)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSources()
    return () => clearInterval(pollRef.current)
  }, [])

  useEffect(() => {
    const hasProcessing = sources.some((s) => s.status === 'pending' || s.status === 'processing')
    if (hasProcessing) {
      pollRef.current = setInterval(fetchSources, 5000)
    } else {
      clearInterval(pollRef.current)
    }
    return () => clearInterval(pollRef.current)
  }, [sources])

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
      await api.post('/sources', body)
      setName('')
      setUrl('')
      setFile(null)
      fetchSources()
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id) => {
    try {
      await api.delete(`/sources/${id}`)
      fetchSources()
    } catch (err) {
      setError(err.message)
    }
  }

  if (loading) return <div className="text-muted-foreground">Chargement...</div>

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Base de connaissances</h1>
        <p className="text-sm text-muted-foreground mt-1">Gerez vos sources de donnees pour l'agent IA</p>
      </div>

      {error && (
        <div className="p-3 mb-4 text-sm rounded-md bg-destructive/10 text-destructive border border-destructive/20">
          {error}
        </div>
      )}

      <Card className="p-4 mb-6">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="file">Upload PDF</TabsTrigger>
            <TabsTrigger value="webpage">Page web</TabsTrigger>
          </TabsList>
          <form onSubmit={handleSubmit} className="mt-4 flex gap-3 items-end">
            <div className="flex-1 space-y-2">
              <Label>Nom</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom de la source" required />
            </div>
            <TabsContent value="file" className="flex-1 mt-0 space-y-2">
              <Label>Fichier PDF</Label>
              <Input type="file" accept=".pdf" onChange={(e) => setFile(e.target.files[0])} required={tab === 'file'} />
            </TabsContent>
            <TabsContent value="webpage" className="flex-1 mt-0 space-y-2">
              <Label>URL</Label>
              <Input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." required={tab === 'webpage'} />
            </TabsContent>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Envoi...' : 'Ajouter'}
            </Button>
          </form>
        </Tabs>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Chunks</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sources.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Aucune source</TableCell></TableRow>
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
                      <span className="ml-2 text-xs text-destructive" title={s.error_message}>(?)</span>
                    )}
                  </TableCell>
                  <TableCell>{s.chunk_count}</TableCell>
                  <TableCell className="text-muted-foreground">{new Date(s.created_at).toLocaleDateString('fr-FR')}</TableCell>
                  <TableCell>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost" className="text-destructive">Supprimer</Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Supprimer cette source ?</AlertDialogTitle>
                          <AlertDialogDescription>Les vecteurs associes seront aussi supprimes.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Annuler</AlertDialogCancel>
                          <AlertDialogAction variant="destructive" onClick={() => handleDelete(s.id)}>Supprimer</AlertDialogAction>
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
