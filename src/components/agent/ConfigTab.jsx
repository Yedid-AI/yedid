import { useState, useEffect } from 'react'
import { api } from '../../lib/api'
import { useI18n } from '../../lib/i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export default function ConfigTab({ agentBotId }) {
  const { t } = useI18n()
  const [config, setConfig] = useState(null)
  const [form, setForm] = useState({ name: '', prompt: '', tone: '', response_length: '', llm_provider: 'openai', llm_model: 'gpt-4.1-mini' })
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
          llm_provider: cfg.llm_provider || 'openai',
          llm_model: cfg.llm_model || 'gpt-4.1-mini',
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
        <CardTitle className="text-base">{t('config.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="p-3 mb-4 text-sm rounded-md bg-destructive/10 text-destructive border border-destructive/20">{error}</div>
        )}
        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-2">
            <Label>{t('common.name')}</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>{t('config.prompt')}</Label>
            <Textarea
              value={form.prompt}
              onChange={(e) => setForm({ ...form, prompt: e.target.value })}
              rows={6}
              placeholder={t('config.promptPlaceholder')}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>{t('config.llmProvider')}</Label>
              <Select value={form.llm_provider} onValueChange={(v) => setForm({ ...form, llm_provider: v, llm_model: v === 'openai' ? 'gpt-4.1-mini' : 'claude-sonnet-4-20250514' })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="anthropic">Anthropic (Claude)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('config.model')}</Label>
              {form.llm_provider === 'anthropic' ? (
                <Select value={form.llm_model} onValueChange={(v) => setForm({ ...form, llm_model: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="claude-sonnet-4-20250514">Claude Sonnet 4</SelectItem>
                    <SelectItem value="claude-haiku-4-20250414">Claude Haiku 4</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Select value={form.llm_model} onValueChange={(v) => setForm({ ...form, llm_model: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gpt-4.1-mini">GPT-4.1 Mini</SelectItem>
                    <SelectItem value="gpt-4.1">GPT-4.1</SelectItem>
                    <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                    <SelectItem value="gpt-4o-mini">GPT-4o Mini</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>{t('config.tone')}</Label>
              <Select value={form.tone} onValueChange={(v) => setForm({ ...form, tone: v === 'none' ? '' : v })}>
                <SelectTrigger><SelectValue placeholder={t('config.toneDefault')} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('config.toneDefault')}</SelectItem>
                  <SelectItem value="professionnel">{t('config.toneProfessional')}</SelectItem>
                  <SelectItem value="amical">{t('config.toneFriendly')}</SelectItem>
                  <SelectItem value="formel">{t('config.toneFormal')}</SelectItem>
                  <SelectItem value="decontracte">{t('config.toneCasual')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('config.responseLength')}</Label>
              <Select value={form.response_length} onValueChange={(v) => setForm({ ...form, response_length: v === 'none' ? '' : v })}>
                <SelectTrigger><SelectValue placeholder={t('config.lengthDefault')} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('config.lengthDefault')}</SelectItem>
                  <SelectItem value="courte">{t('config.lengthShort')}</SelectItem>
                  <SelectItem value="moyenne">{t('config.lengthMedium')}</SelectItem>
                  <SelectItem value="longue">{t('config.lengthLong')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button type="submit" disabled={saving}>
              {success ? t('common.saved') : saving ? t('common.saving') : t('common.save')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
