'use client'

import Image from 'next/image'
import { useSession } from '@/lib/web/session'
import { Button } from '@/components/web/ui'
import { useT } from '@/lib/i18n'

/**
 * Where a removed account lands.
 *
 * Distinct from /suspended: a suspension is a pause an admin may lift, while
 * this account has been taken out of the marketplace. Every API route already
 * refuses it with 403 ACCOUNT_REMOVED, so this page exists to say why rather
 * than leave them bouncing off silent failures.
 */
export default function RemovedPage() {
  const t = useT()
  const { profile, signOut } = useSession()

  return (
    <div data-role={profile?.role} className="flex min-h-screen items-center justify-center px-4 py-8 sm:py-12">
      <div className="w-full max-w-md text-center">
        <Image src="/logo.png" alt={t('status.helpershob')} width={90} height={82} priority className="mx-auto h-auto" />

        <span className="mt-5 inline-flex rounded-full bg-surface-muted px-3.5 py-1 text-xs font-semibold text-ink-70">
          {t('status.accountRemoved')}
        </span>

        <h1 className="mt-4 text-2xl font-bold tracking-tight text-ink">
          {t('status.thisAccountHasBeenRemoved')}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-70">
          {t('status.youCanNoLongerBookWork')}
        </p>

        <div className="mt-7 space-y-3">
          <a href="mailto:support@helpershob.com" className="block">
            <Button size="lg" fullWidth>{t('status.contactSupport')}</Button>
          </a>
          <Button size="lg" variant="outline" fullWidth onClick={signOut}>{t('status.signOut')}</Button>
        </div>
      </div>
    </div>
  )
}
