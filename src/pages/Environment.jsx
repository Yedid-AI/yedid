import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '../lib/i18n'
import { usePageTitle, usePageHeader } from '../lib/page-header'
import { useSettings, useUpdateSettings } from '../hooks/queries'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Eye, EyeOff, Save, Check } from 'lucide-react'

const GROUPS = [
  {
    title: 'OpenAI',
    descriptionKey: 'environment.openaiDesc',
    keys: [
      { key: 'OPENAI_API_KEY', label: 'API Key', placeholder: 'sk-...' },
    ],
  },
  {
    title: 'Anthropic',
    descriptionKey: 'environment.anthropicDesc',
    keys: [
      { key: 'ANTHROPIC_API_KEY', label: 'API Key', placeholder: 'sk-ant-...' },
    ],
  },
  {
    title: 'Firecrawl',
    descriptionKey: 'environment.firecrawlDesc',
    keys: [
      { key: 'FIRECRAWL_URL', label: 'URL', placeholder: 'https://...' },
    ],
  },
  {
    title: 'Chatwoot',
    descriptionKey: 'environment.chatwootDesc',
    keys: [
      { key: 'CHATWOOT_PLATFORM_URL', label: 'Platform URL', placeholder: 'https://chat.yedid.io' },
      { key: 'CHATWOOT_PLATFORM_TOKEN', label: 'Platform Token', placeholder: 'Token platform API...' },
      { key: 'CHATWOOT_ADMIN_TOKEN', label: 'Admin User Token', placeholder: 'Token admin pour Account API (inboxes, bots)...' },
    ],
  },
  {
    title: 'Unipile',
    titleKey: 'environment.unipileTitle',
    descriptionKey: 'environment.unipileDesc',
    keys: [
      { key: 'UNIPILE_API_KEY', label: 'API Key', placeholderKey: 'environment.unipileApiKeyPlaceholder' },
      { key: 'UNIPILE_DSN_URL', label: 'DSN URL', placeholder: 'https://api14.unipile.com:14433' },
    ],
  },
  {
    title: 'Maskyoo',
    titleKey: 'environment.maskyooTitle',
    descriptionKey: 'environment.maskyooDesc',
    keys: [
      { key: 'MASKYOO_API_URL', label: 'API URL', placeholder: 'https://www.maskyoo.com/babait' },
      { key: 'MASKYOO_API_TOKEN', label: 'Bearer Token', placeholder: 'Token...' },
    ],
  },
  {
    title: 'Application',
    titleKey: 'environment.appTitle',
    descriptionKey: 'environment.appDesc',
    keys: [
      { key: 'APP_BASE_URL', labelKey: 'environment.appBaseLabel', placeholder: 'https://app.yedid.io' },
    ],
  },
  {
    title: 'Agent API',
    titleKey: 'environment.agentApiTitle',
    descriptionKey: 'environment.agentApiDesc',
    keys: [
      { key: 'AGENT_API_KEY', label: 'API Key', placeholderKey: 'environment.agentApiKeyPlaceholder' },
    ],
  },
  {
    title: 'Public Lead API',
    descriptionKey: 'environment.publicLeadDesc',
    keys: [
      { key: 'LEAD_API_KEY', label: 'API Key', placeholder: 'Cle secrete pour endpoint public...' },
      { key: 'LEAD_DEFAULT_USER_ID', label: 'User ID par defaut', placeholder: '1' },
    ],
  },
]

export default function Environment() {
  const { t } = useI18n()
  usePageTitle(t('environment.title'))
  const { actionsContainer } = usePageHeader()
  const { data: settings = {}, isLoading } = useSettings()
  const updateSettings = useUpdateSettings()
  const [values, setValues] = useState({})
  const [revealed, setRevealed] = useState({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  // Initialize values state when settings load
  useEffect(() => {
    if (!settings || Object.keys(settings).length === 0) return
    const initial = {}
    for (const key of Object.keys(settings)) {
      initial[key] = ''
    }
    setValues(initial)
  }, [settings])

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
      await updateSettings.mutateAsync(changed)

      // Reset input values after successful save
      const reset = {}
      for (const key of Object.keys(settings)) {
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

  if (isLoading) return <div className="text-muted-foreground">{t('common.loading')}</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-sm text-muted-foreground mt-1">{t('environment.subtitle')}</p>
        </div>
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
                  <CardTitle className="text-base">{group.titleKey ? t(group.titleKey) : group.title}</CardTitle>
                  <CardDescription className="text-sm">{t(group.descriptionKey)}</CardDescription>
                </div>
                <div className="flex gap-1.5">
                  {group.keys.map(({ key }) => (
                    <Badge key={key} variant={settings[key]?.isSet ? 'default' : 'secondary'}>
                      {settings[key]?.isSet ? t('common.configured') : t('common.notConfigured')}
                    </Badge>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {group.keys.map((item) => {
                const { key, label, placeholder } = item
                const info = settings[key] || {}
                const isRevealed = revealed[key]
                return (
                  <div key={key} className="space-y-1.5">
                    <Label className="text-sm">{item.labelKey ? t(item.labelKey) : label}</Label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Input
                          type={info.isSecret && !isRevealed ? 'password' : 'text'}
                          value={values[key] || ''}
                          onChange={(e) => setValues({ ...values, [key]: e.target.value })}
                          placeholder={info.isSet ? info.value : (item.placeholderKey ? t(item.placeholderKey) : placeholder)}
                          className="pe-10 font-mono text-sm"
                        />
                        {info.isSecret && (
                          <button
                            type="button"
                            onClick={() => setRevealed({ ...revealed, [key]: !isRevealed })}
                            className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
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

      {actionsContainer && createPortal(
        <Button onClick={handleSave} disabled={saving}>
          {saved ? <><Check size={16} className="me-2" />{t('common.saved')}</> : <><Save size={16} className="me-2" />{saving ? t('common.saving') : t('common.save')}</>}
        </Button>,
        actionsContainer
      )}
    </div>
  )
}
