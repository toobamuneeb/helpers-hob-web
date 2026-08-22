import type { Metadata } from 'next'
import { SessionProvider } from '@/lib/web/session'
import WebShell from '@/components/web/WebShell'

export const metadata: Metadata = {
  title: 'HelpersHob',
  description: 'Helping hands, caring hearts',
}

/**
 * Layout for the customer/provider web app.
 *
 * Scoped to this route group so /bank-details and /payment/* — which the mobile
 * app loads inside WebViews — keep the plain root layout and are untouched.
 */
export default function WebLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <div className="font-public flex min-h-screen flex-col bg-canvas text-ink">
        <WebShell>{children}</WebShell>
      </div>
    </SessionProvider>
  )
}
