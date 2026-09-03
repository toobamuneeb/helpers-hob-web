'use client'

// Bridges the session to the i18n provider. Split out from I18nProvider so
// that provider stays free of any session dependency and can be mounted on its
// own — the WebView routes under /payment and /bank-details use the plain root
// layout and have no session at all.

import { useSession } from '@/lib/web/session'
import { I18nProvider } from '@/lib/i18n'

export default function LocaleGate({ children }: { children: React.ReactNode }) {
  const { profile } = useSession()
  return <I18nProvider profileLocale={profile?.preferred_language}>{children}</I18nProvider>
}
