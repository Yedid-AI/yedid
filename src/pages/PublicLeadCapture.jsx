import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { CheckCircle, Loader2, AlertTriangle } from 'lucide-react'

const API_URL = import.meta.env.VITE_API_URL || ''

export default function PublicLeadCapture() {
  const { token } = useParams()
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    name: '', phone: '', email: '', city: '',
    service_requested: '', details: '', custom_fields: {},
  })

  useEffect(() => {
    fetch(`${API_URL}/api/public/capture/${token}`)
      .then(r => {
        if (!r.ok) throw new Error('Lien invalide')
        return r.json()
      })
      .then(data => { setConfig(data); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [token])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name || !form.phone) return
    setSubmitting(true)

    try {
      const body = { ...form }
      // Merge custom_fields
      if (Object.keys(body.custom_fields).length === 0) delete body.custom_fields

      const res = await fetch(`${API_URL}/api/public/capture/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Erreur')
      }
      setSubmitted(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  if (error && !config) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertTriangle className="h-12 w-12 text-red-400 mx-auto mb-4" />
            <p className="text-lg font-medium text-gray-900">Lien invalide</p>
            <p className="text-sm text-gray-500 mt-2">Ce lien de capture n'existe pas ou a expire.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <CheckCircle className="h-12 w-12 text-emerald-500 mx-auto mb-4" />
            <p className="text-lg font-medium text-gray-900">Merci !</p>
            <p className="text-sm text-gray-500 mt-2">Vos informations ont bien ete envoyees.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="text-xl">
            {config?.enterprise || 'Nouveau contact'}
          </CardTitle>
          <CardDescription>
            {config?.user_name && `Formulaire de ${config.user_name}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</p>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Nom *</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Telephone *</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="city">Ville</Label>
                <Input
                  id="city"
                  value={form.city}
                  onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="service">Service demande</Label>
              <Input
                id="service"
                value={form.service_requested}
                onChange={e => setForm(f => ({ ...f, service_requested: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="details">Details</Label>
              <Textarea
                id="details"
                value={form.details}
                onChange={e => setForm(f => ({ ...f, details: e.target.value }))}
                rows={3}
              />
            </div>

            {/* Custom fields from lead_field_definitions */}
            {config?.fields?.map(field => (
              <div key={field.field_key} className="space-y-1.5">
                <Label>{field.label} {field.required && '*'}</Label>
                {field.field_type === 'select' ? (
                  <Select
                    value={form.custom_fields[field.field_key] || ''}
                    onValueChange={v => setForm(f => ({
                      ...f,
                      custom_fields: { ...f.custom_fields, [field.field_key]: v }
                    }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(field.options || []).map(opt => (
                        <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    type={field.field_type === 'number' ? 'number' : 'text'}
                    value={form.custom_fields[field.field_key] || ''}
                    onChange={e => setForm(f => ({
                      ...f,
                      custom_fields: { ...f.custom_fields, [field.field_key]: e.target.value }
                    }))}
                    required={field.required}
                  />
                )}
              </div>
            ))}

            <Button type="submit" className="w-full" disabled={submitting || !form.name || !form.phone}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin me-2" /> : null}
              Envoyer
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
