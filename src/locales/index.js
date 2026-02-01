import fr from './fr.js'
import en from './en.js'
import he from './he.js'

export const locales = { fr, en, he }

export const localeConfig = {
  fr: { label: 'Francais', dir: 'ltr', dateLocale: 'fr-FR' },
  en: { label: 'English', dir: 'ltr', dateLocale: 'en-US' },
  he: { label: 'עברית', dir: 'rtl', dateLocale: 'he-IL' },
}

export const defaultLocale = 'fr'
