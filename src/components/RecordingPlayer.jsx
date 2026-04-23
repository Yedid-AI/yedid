import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Download, Loader2 } from 'lucide-react'

export function RecordingPlayer({ uuid, t }) {
  const [blobUrl, setBlobUrl] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!uuid) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setBlobUrl(null)

    const token = localStorage.getItem('token')
    fetch(`/api/calls/${encodeURIComponent(uuid)}/recording`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (cancelled) return
        const ct = res.headers.get('content-type') || ''
        if (!res.ok || ct.includes('json')) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || 'Recording not available')
        }
        return res.blob()
      })
      .then((blob) => {
        if (cancelled || !blob) return
        setBlobUrl(URL.createObjectURL(blob))
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
      setBlobUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null })
    }
  }, [uuid])

  if (loading) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={14} className="animate-spin" />{t?.('common.loading') || 'Loading…'}</div>
  if (error) return <div className="text-sm text-muted-foreground">{error}</div>
  if (!blobUrl) return null

  return (
    <div className="flex items-center gap-2">
      <audio controls src={blobUrl} className="w-full h-8" preload="auto" />
      <a href={blobUrl} download={`${uuid}.mp3`} className="shrink-0">
        <Button variant="ghost" size="icon" className="h-8 w-8"><Download size={14} /></Button>
      </a>
    </div>
  )
}
