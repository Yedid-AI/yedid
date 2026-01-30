import { useState, useEffect } from 'react'
import { api } from '../../lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export default function ConfigTab({ agentBotId }) {
  const [config, setConfig] = useState(null)
  const [form, setForm] = useState({ name: '', prompt: '', tone: '', response_length: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    api.get(`/agent-bots/${agentBotId}`)
      .then((data) => {
        const cfg = data.agent_bot?.agent_config?.[0] || data.agent_bot?.agent_config || {}
        setConfig(cfg)
        setForm({
          name: cfg.name || '',
          prompt: cfg.prompt || '',
          tone: cfg.tone || '',
          response_length: cfg.response_length || '',
        })
      })
      .catch((err) => setError(err.message))
  }, [agentBotId])

  const handleSave = async (e) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    setSuccess(false)
    try {
      await api.put(`/agent-bots/${agentBotId}/config`, form)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 2000)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Configuration de l'agent</CardTitle>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="p-3 mb-4 text-sm rounded-md bg-destructive/10 text-destructive border border-destructive/20">{error}</div>
        )}
        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-2">
            <Label>Nom</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Prompt systeme</Label>
            <Textarea
              value={form.prompt}
              onChange={(e) => setForm({ ...form, prompt: e.target.value })}
              rows={6}
              placeholder="Instructions generales pour l'agent..."
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Ton</Label>
              <Select value={form.tone} onValueChange={(v) => setForm({ ...form, tone: v === 'none' ? '' : v })}>
                <SelectTrigger><SelectValue placeholder="Par defaut" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Par defaut</SelectItem>
                  <SelectItem value="professionnel">Professionnel</SelectItem>
                  <SelectItem value="amical">Amical</SelectItem>
                  <SelectItem value="formel">Formel</SelectItem>
                  <SelectItem value="decontracte">Decontracte</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Longueur des reponses</Label>
              <Select value={form.response_length} onValueChange={(v) => setForm({ ...form, response_length: v === 'none' ? '' : v })}>
                <SelectTrigger><SelectValue placeholder="Par defaut" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Par defaut</SelectItem>
                  <SelectItem value="courte">Courte</SelectItem>
                  <SelectItem value="moyenne">Moyenne</SelectItem>
                  <SelectItem value="longue">Longue</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button type="submit" disabled={saving}>
              {success ? 'Enregistre' : saving ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
