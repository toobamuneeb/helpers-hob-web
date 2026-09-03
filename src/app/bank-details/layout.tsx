'use client'

import { I18nProvider } from '@/lib/i18n'

/**
 * Language for the Mollie/Stripe return page.
 *
 * This route is opened inside the mobile app's WebView as a payment provider's
 * callback, so there is no session here and no chance to pass the account's
 * language along — the provider builds the URL, not us. I18nProvider falls back
 * to the browser's own language, which in a WebView is the phone's, so a Dutch
 * handset lands on Dutch.
 */
export default function BankDetailsLayout({ children }: { children: React.ReactNode }) {
  return <I18nProvider>{children}</I18nProvider>
}
