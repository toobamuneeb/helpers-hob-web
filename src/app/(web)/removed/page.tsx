'use client'

import Image from 'next/image'
import { useSession } from '@/lib/web/session'
import { Button } from '@/components/web/ui'

/**
 * Where a removed account lands.
 *
 * Distinct from /suspended: a suspension is a pause an admin may lift, while
 * this account has been taken out of the marketplace. Every API route already
 * refuses it with 403 ACCOUNT_REMOVED, so this page exists to say why rather
 * than leave them bouncing off silent failures.
 */
export default function RemovedPage() {
  const { profile, signOut } = useSession()

  return (
    <div data-role={profile?.role} className="flex min-h-screen items-center justify-center px-4 py-8 sm:py-12">
      <div className="w-full max-w-md text-center">
        <Image src="/logo.png" alt="HelpersHob" width={90} height={82} priority className="mx-auto h-auto" />

        <span className="mt-5 inline-flex rounded-full bg-surface-muted px-3.5 py-1 text-xs font-semibold text-ink-70">
          Account removed
        </span>

        <h1 className="mt-4 text-2xl font-bold tracking-tight text-ink">
          This account has been removed
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-70">
          You can no longer book work or take on jobs with this account. If you
          think this is a mistake, get in touch and we will look into it.
        </p>

        <div className="mt-7 space-y-3">
          <a href="mailto:support@helpershob.com" className="block">
            <Button size="lg" fullWidth>Contact support</Button>
          </a>
          <Button size="lg" variant="outline" fullWidth onClick={signOut}>Sign out</Button>
        </div>
      </div>
    </div>
  )
}
