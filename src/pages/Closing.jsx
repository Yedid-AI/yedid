import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '../lib/i18n'
import { usePageTitle, usePageHeader } from '../lib/page-header'
import { api } from '../lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Save, Check } from 'lucide-react'

const CLOSING_KEYS = [
  'CLOSING_ENABLED',
  'CLOSING_INTERVAL_MINUTES',
  'CLOSING_INACTIVITY_MINUTES',
  'CLOSING_LLM_PROVIDER',
  'CLOSING_LLM_MODEL',
  'CLOSING_BILLING_PROMPT',
]

const DEFAULT_BILLING_PROMPT = `You are Cardynal Billing Analyzer. Your task is to determine whether a support conversation is billable or non-billable.

BILLABLE RULES

A conversation is billable if ANY of the following occur:

The user expresses a real business or technical need, such as:
- optimization
- improvement
- integration
- troubleshooting
- product questions
- workflow questions
- performance issues

The agent asks a clarification question as part of a diagnostic or business-oriented analysis.

The agent begins any expert reasoning, including:
- diagnostic steps
- analysis
- recommendations
- business explanations
- solution-oriented questioning

The agent provides any business value, even partially:
- initial guidance
- strategic orientation
- tailored explanation
- actionable next steps

The user leaves the conversation after the agent has started a diagnostic or value-adding process.
→ This is always billable.
(If the agent begins value creation and the user stops responding, the session is classified as billable.)

NON-BILLABLE RULES

A conversation is non-billable only if ALL of the following are true:

The exchange contains only greetings or social chit-chat.

The user message is a test, empty, irrelevant, or unusable.

The agent provides zero value:
- no analysis
- no diagnostic
- no recommendations
- no business explanation

If the agent did not create value and the user did not express any business/technical need, then it is non-billable.

CENTRAL PRINCIPLE

If the conversation touches a business or technical topic, and the agent engages with even the beginning of a diagnostic or analysis, the session is billable.

If the customer stops mid-conversation after the agent begins a diagnostic → billable.

OUTPUT FORMAT (Mandatory)

Return only valid JSON:

{"billable": true or false, "confidence": 0.0, "reason": "short explanation"}

No introduction. Analyze strictly based on the provided messages. Respond only in JSON.`

export default function Closing() {
  const { t } = useI18n()
  usePageTitle(t('closing.title'))
  const { actionsContainer } = usePageHeader()
  const [settings, setSettings] = useState({})
  const [values, setValues] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/settings')
      .then((data) => {
        setSettings(data.settings)
        const initial = {}
        for (const key of CLOSING_KEYS) {
          initial[key] = ''
        }
        setValues(initial)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const getVal = (key) => {
    if (values[key]) return values[key]
    if (settings[key]?.value) return settings[key].value
    if (key === 'CLOSING_BILLING_PROMPT') return DEFAULT_BILLING_PROMPT
    return ''
  }

  const setVal = (key, val) => setValues({ ...values, [key]: val })

  const handleSave = async () => {
    setError('')
    setSaving(true)
    setSaved(false)
    try {
      const changed = {}
      for (const [key, val] of Object.entries(values)) {
        if (val !== '' && CLOSING_KEYS.includes(key)) changed[key] = val
      }
      if (Object.keys(changed).length === 0) {
        setSaving(false)
        return
      }
      await api.put('/settings', { settings: changed })

      const data = await api.get('/settings')
      setSettings(data.settings)
      const reset = {}
      for (const key of CLOSING_KEYS) {
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

  if (loading) return <div className="text-muted-foreground">{t('common.loading')}</div>

  const isEnabled = getVal('CLOSING_ENABLED') === 'true'
  const provider = getVal('CLOSING_LLM_PROVIDER') || 'openai'

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-sm text-muted-foreground mt-1">{t('closing.subtitle')}</p>
        </div>
      </div>

      {error && (
        <div className="p-3 mb-4 text-sm rounded-md bg-destructive/10 text-destructive">{error}</div>
      )}

      <div className="space-y-4">
        {/* Card 1 — Cron Schedule */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t('closing.cronTitle')}</CardTitle>
            <CardDescription className="text-sm">{t('closing.cronDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Switch
                checked={isEnabled}
                onCheckedChange={(checked) => setVal('CLOSING_ENABLED', checked ? 'true' : 'false')}
              />
              <Label className="text-sm">{t('closing.enabled')}</Label>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm">{t('closing.interval')}</Label>
                <Input
                  type="number"
                  min={1}
                  value={getVal('CLOSING_INTERVAL_MINUTES')}
                  onChange={(e) => setVal('CLOSING_INTERVAL_MINUTES', e.target.value)}
                  placeholder={t('closing.intervalPlaceholder')}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">{t('closing.inactivity')}</Label>
                <Input
                  type="number"
                  min={1}
                  value={getVal('CLOSING_INACTIVITY_MINUTES')}
                  onChange={(e) => setVal('CLOSING_INACTIVITY_MINUTES', e.target.value)}
                  placeholder={t('closing.inactivityPlaceholder')}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card 2 — LLM Configuration */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t('closing.llmTitle')}</CardTitle>
            <CardDescription className="text-sm">{t('closing.llmDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm">{t('closing.provider')}</Label>
                <Select value={provider} onValueChange={(val) => setVal('CLOSING_LLM_PROVIDER', val)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="openai">OpenAI</SelectItem>
                    <SelectItem value="anthropic">Anthropic</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">{t('closing.model')}</Label>
                <Input
                  value={getVal('CLOSING_LLM_MODEL')}
                  onChange={(e) => setVal('CLOSING_LLM_MODEL', e.target.value)}
                  placeholder={provider === 'anthropic' ? 'claude-sonnet-4-20250514' : 'gpt-4.1-mini'}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card 3 — Billing Prompt */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t('closing.promptTitle')}</CardTitle>
            <CardDescription className="text-sm">{t('closing.promptDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              rows={16}
              className="font-mono text-sm"
              value={getVal('CLOSING_BILLING_PROMPT')}
              onChange={(e) => setVal('CLOSING_BILLING_PROMPT', e.target.value)}
              placeholder={t('closing.promptPlaceholder')}
            />
          </CardContent>
        </Card>
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
