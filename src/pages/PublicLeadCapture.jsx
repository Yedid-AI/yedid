import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
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
        if (!r.ok) throw new Error('קישור לא תקין')
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
      if (Object.keys(body.custom_fields).length === 0) delete body.custom_fields

      const res = await fetch(`${API_URL}/api/public/capture/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'שגיאה')
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-stone-50 to-stone-100" dir="rtl">
        <Loader2 className="h-8 w-8 animate-spin text-stone-400" />
      </div>
    )
  }

  if (error && !config) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-stone-50 to-stone-100 p-4" dir="rtl">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8 text-center">
          <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
          <p className="text-lg font-semibold text-stone-900">קישור לא תקין</p>
          <p className="text-sm text-stone-500 mt-2">קישור הלכידה אינו קיים או שפג תוקפו.</p>
        </div>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-stone-50 to-stone-100 p-4" dir="rtl">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8 text-center">
          <CheckCircle className="h-14 w-14 text-emerald-500 mx-auto mb-4" />
          <p className="text-xl font-semibold text-stone-900">תודה רבה!</p>
          <p className="text-sm text-stone-500 mt-2">הפרטים נשלחו בהצלחה.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-stone-50 to-stone-100 p-4" dir="rtl">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-lg overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-l from-primary/10 via-primary/5 to-transparent px-6 py-5 border-b">
          <h1 className="text-lg font-bold text-stone-900">
            {config?.enterprise || 'יצירת קשר'}
          </h1>
          {config?.user_name && (
            <p className="text-sm text-stone-500 mt-0.5">טופס של {config.user_name}</p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 p-3 rounded-lg">{error}</p>
          )}

          {/* Contact fields */}
          <div className="space-y-3">
            <span className="text-xs font-semibold text-stone-500 uppercase tracking-wide">פרטי קשר</span>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[13px] text-stone-600">שם מלא <span className="text-red-500">*</span></Label>
                <Input
                  className="h-10 w-full"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  required
                  placeholder="הכנס שם מלא"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[13px] text-stone-600">טלפון <span className="text-red-500">*</span></Label>
                <Input
                  className="h-10 w-full"
                  type="tel"
                  dir="ltr"
                  value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  required
                  placeholder="05x-xxx-xxxx"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[13px] text-stone-600">אימייל</Label>
                <Input
                  className="h-10 w-full"
                  type="email"
                  dir="ltr"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="email@example.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[13px] text-stone-600">עיר</Label>
                <Input
                  className="h-10 w-full"
                  value={form.city}
                  onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                  placeholder="עיר מגורים"
                />
              </div>
            </div>
          </div>

          {/* Service */}
          <div className="space-y-1.5">
            <Label className="text-[13px] text-stone-600">שירות מבוקש</Label>
            <Select value={form.service_requested || '__empty__'} onValueChange={v => setForm(f => ({ ...f, service_requested: v === '__empty__' ? '' : v }))}>
              <SelectTrigger className="h-10 w-full"><SelectValue placeholder="בחר שירות" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__empty__">-</SelectItem>
                {(config?.services || []).map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Details */}
          <div className="space-y-1.5">
            <Label className="text-[13px] text-stone-600">פרטים נוספים</Label>
            <Textarea
              className="min-h-[80px] resize-none w-full"
              value={form.details}
              onChange={e => setForm(f => ({ ...f, details: e.target.value }))}
              rows={3}
              placeholder="הערות, הנחיות..."
            />
          </div>

          {/* Custom fields */}
          {config?.fields?.map(field => (
            <div key={field.field_key} className="space-y-1.5">
              <Label className="text-[13px] text-stone-600">{field.label} {field.required && <span className="text-red-500">*</span>}</Label>
              {field.field_type === 'select' ? (
                <Select
                  value={form.custom_fields[field.field_key] || ''}
                  onValueChange={v => setForm(f => ({
                    ...f,
                    custom_fields: { ...f.custom_fields, [field.field_key]: v }
                  }))}
                >
                  <SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(field.options || []).map(opt => (
                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  className="h-10 w-full"
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

          <Button type="submit" className="w-full h-11 text-sm font-medium" disabled={submitting || !form.name || !form.phone}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin me-2" /> : null}
            שליחה
          </Button>
        </form>
      </div>
    </div>
  )
}
