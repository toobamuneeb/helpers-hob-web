'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import i18next, { type i18n as I18nInstance } from 'i18next'
import { I18nextProvider, useTranslation as useI18nextTranslation } from 'react-i18next'

import en from './locales/en.json'
import nl from './locales/nl.json'
import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  detectLocale,
  isLocale,
  type Locale,
} from './config'

/**
 * One i18next instance for the whole web app.
 *
 * Created at module scope rather than in an effect so the first render already
 * has strings — with the bundles passed in as `resources` and no backend to
 * wait on, init resolves synchronously. It starts on the default locale and the provider switches it after mount — resolving the real
 * locale needs localStorage and the profile, neither of which exists during
 * SSR, and rendering Dutch on the server while the client wants English (or
 * the reverse) is a hydration mismatch.
 */
const instance: I18nInstance = i18next.createInstance()

void instance.init({
  resources: {
    en: { translation: en },
    nl: { translation: nl },
  },
  lng: DEFAULT_LOCALE,
  fallbackLng: DEFAULT_LOCALE,
  // A key that exists in en.json but not yet in nl.json falls back to English
  // rather than rendering the raw key at the user.
  returnEmptyString: false,
  interpolation: { escapeValue: false },
})

interface LocaleValue {
  locale: Locale
  /** Switches the UI and remembers the choice on this device. */
  setLocale: (next: Locale) => void
  /** False until the stored/profile locale has been applied after mount. */
  ready: boolean
}

const LocaleContext = createContext<LocaleValue | null>(null)

export function I18nProvider({
  children,
  profileLocale,
}: {
  children: React.ReactNode
  /** From profiles.preferred_language; wins over the device once it arrives. */
  profileLocale?: string | null
}) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE)
  const [ready, setReady] = useState(false)

  const apply = useCallback((next: Locale) => {
    setLocaleState(next)
    void instance.changeLanguage(next)
    if (typeof document !== 'undefined') document.documentElement.lang = next
  }, [])

  // Device preference, once — before the profile has loaded, and for anyone
  // signed out on the sign-up screens.
  useEffect(() => {
    apply(detectLocale())
    setReady(true)
  }, [apply])

  // The account's choice, when it arrives. It follows the user across devices,
  // so it overrides whatever this particular browser had remembered.
  useEffect(() => {
    if (isLocale(profileLocale)) apply(profileLocale)
  }, [profileLocale, apply])

  const setLocale = useCallback(
    (next: Locale) => {
      apply(next)
      try {
        window.localStorage.setItem(LOCALE_STORAGE_KEY, next)
      } catch {
        // Storage unavailable — the choice still applies for this session.
      }
    },
    [apply],
  )

  const value = useMemo(() => ({ locale, setLocale, ready }), [locale, setLocale, ready])

  return (
    <LocaleContext.Provider value={value}>
      <I18nextProvider i18n={instance}>{children}</I18nextProvider>
    </LocaleContext.Provider>
  )
}

/** The active locale plus the setter. For strings, use `useT`. */
export function useLocale(): LocaleValue {
  const ctx = useContext(LocaleContext)
  if (!ctx) throw new Error('useLocale must be used inside <I18nProvider>')
  return ctx
}

/**
 * `const t = useT()` then `t('auth.signIn')`.
 *
 * Thin wrapper over react-i18next so screens import from one place and the
 * library stays swappable.
 */
export function useT() {
  const { t } = useI18nextTranslation()
  return t
}

export { instance as i18n }
export * from './config'
