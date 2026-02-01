import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { locales, localeConfig, defaultLocale } from '../locales/index.js'

const I18nContext = createContext(null)

export function I18nProvider({ children }) {
  const [locale, setLocale] = useState(() => {
    const stored = localStorage.getItem('locale')
    return stored && locales[stored] ? stored : defaultLocale
  })

  useEffect(() => {
    localStorage.setItem('locale', locale)
    const config = localeConfig[locale]
    document.documentElement.lang = locale
    document.documentElement.dir = config.dir
  }, [locale])

  const t = useCallback((key, params) => {
    const str = locales[locale]?.[key] || locales[defaultLocale]?.[key] || key
    if (!params) return str
    return str.replace(/\{(\w+)\}/g, (_, k) => params[k] ?? `{${k}}`)
  }, [locale])

  const config = localeConfig[locale]

  return (
    <I18nContext.Provider value={{ locale, setLocale, t, dir: config.dir, dateLocale: config.dateLocale }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within I18nProvider')
  return ctx
}
