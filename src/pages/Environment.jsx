import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Eye, EyeOff, Save, Check } from 'lucide-react'

const GROUPS = [
  {
    title: 'OpenAI',
    description: 'LLM et embeddings (base de connaissances)',
    keys: [
      { key: 'OPENAI_API_KEY', label: 'API Key', placeholder: 'sk-...' },
    ],
  },
  {
    title: 'Anthropic',
    description: 'LLM Claude (alternatif a OpenAI)',
    keys: [
      { key: 'ANTHROPIC_API_KEY', label: 'API Key', placeholder: 'sk-ant-...' },
    ],
  },
  {
    title: 'Firecrawl',
    description: 'Extraction de contenu web',
    keys: [
      { key: 'FIRECRAWL_URL', label: 'URL', placeholder: 'https://...' },
    ],
  },
  {
    title: 'Chatwoot',
    description: 'Provisioning des comptes chat',
    keys: [
      { key: 'CHATWOOT_PLATFORM_URL', label: 'Platform URL', placeholder: 'https://chat.cardynal.io' },
      { key: 'CHATWOOT_PLATFORM_TOKEN', label: 'Platform Token', placeholder: 'Token platform API...' },
      { key: 'CHATWOOT_ADMIN_TOKEN', label: 'Admin User Token', placeholder: 'Token admin pour Account API (inboxes, bots)...' },
    ],
  },
  {
    title: 'Application',
    description: 'URL de base pour les webhooks Chatwoot',
    keys: [
      { key: 'APP_BASE_URL', label: 'URL de base', placeholder: 'https://app.cardynal.io' },
    ],
  },
  {
    title: 'Agent API',
    description: 'Authentification pour les appels agent',
    keys: [
      { key: 'AGENT_API_KEY', label: 'API Key', placeholder: 'Cle secrete...' },
    ],
  },
]

export default function Environment() {
  const [settings, setSettings] = useState({})
  const [values, setValues] = useState({})
  const [revealed, setRevealed] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/settings')
      .then((data) => {
        setSettings(data.settings)
        // Initialize values — empty string means "not changed"
        const initial = {}
        for (const key of Object.keys(data.settings)) {
          initial[key] = ''
        }
        setValues(initial)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setError('')
    setSaving(true)
    setSaved(false)
    try {
      // Only send changed values (non-empty)
      const changed = {}
      for (const [key, val] of Object.entries(values)) {
        if (val !== '') changed[key] = val
      }
      if (Object.keys(changed).length === 0) {
        setSaving(false)
        return
      }
      await api.put('/settings', { settings: changed })

      // Refresh
      const data = await api.get('/settings')
      setSettings(data.settings)
      const reset = {}
      for (const key of Object.keys(data.settings)) {
        reset[key] = ''
      }
      setValues(reset)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="text-muted-foreground">Chargement...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Environnement</h1>
          <p className="text-sm text-muted-foreground mt-1">Cles API et configuration des services externes</p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saved ? <><Check size={16} className="mr-2" />Enregistre</> : <><Save size={16} className="mr-2" />{saving ? 'Enregistrement...' : 'Enregistrer'}</>}
        </Button>
      </div>

      {error && (
        <div className="p-3 mb-4 text-sm rounded-md bg-destructive/10 text-destructive">{error}</div>
      )}

      <div className="space-y-4">
        {GROUPS.map((group) => (
          <Card key={group.title}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">{group.title}</CardTitle>
                  <CardDescription className="text-sm">{group.description}</CardDescription>
                </div>
                <div className="flex gap-1.5">
                  {group.keys.map(({ key }) => (
                    <Badge key={key} variant={settings[key]?.isSet ? 'default' : 'secondary'}>
                      {settings[key]?.isSet ? 'Configure' : 'Non configure'}
                    </Badge>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {group.keys.map(({ key, label, placeholder }) => {
                const info = settings[key] || {}
                const isRevealed = revealed[key]
                return (
                  <div key={key} className="space-y-1.5">
                    <Label className="text-sm">{label}</Label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Input
                          type={info.isSecret && !isRevealed ? 'password' : 'text'}
                          value={values[key] || ''}
                          onChange={(e) => setValues({ ...values, [key]: e.target.value })}
                          placeholder={info.isSet ? info.value : placeholder}
                          className="pr-10 font-mono text-sm"
                        />
                        {info.isSecret && (
                          <button
                            type="button"
                            onClick={() => setRevealed({ ...revealed, [key]: !isRevealed })}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          >
                            {isRevealed ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
