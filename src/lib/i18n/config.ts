// The two languages the app ships. Adding a third means a new locale JSON, an
// entry here, and widening the profiles.preferred_language check constraint.

export const LOCALES = ['en', 'nl'] as const
export type Locale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: Locale = 'en'

/** Shown in the language picker — each in its own language, never translated. */
export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  nl: 'Nederlands',
}

export const LOCALE_FLAGS: Record<Locale, string> = {
  en: '🇬🇧',
  nl: '🇳🇱',
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}

/**
 * Best guess before the profile has loaded — a signed-out visitor on the
 * sign-up screen still needs the page in a sensible language.
 *
 * Order: what they last chose on this device, then what the browser asks for,
 * then English. `navigator.language` is matched on the primary subtag so
 * 'nl-BE' and 'nl-NL' both land on Dutch.
 */
export function detectLocale(): Locale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE

  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY)
    if (isLocale(stored)) return stored
  } catch {
    // Private-mode Safari throws on localStorage; fall through to the browser.
  }

  const browser = window.navigator.language?.split('-')[0]
  return isLocale(browser) ? browser : DEFAULT_LOCALE
}

export const LOCALE_STORAGE_KEY = 'hh.locale'
