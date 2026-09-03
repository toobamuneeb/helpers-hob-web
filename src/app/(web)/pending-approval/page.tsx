'use client'

import Image from 'next/image'
import { useState } from 'react'
import { useSession } from '@/lib/web/session'
import { Button } from '@/components/web/ui'
import { useT } from '@/lib/i18n'

/**
 * Shown while profile_status is 'pending'.
 *
 * For providers this is the real gate: documents are submitted and an admin has
 * to approve them. The API refuses their requests with 403
 * ACCOUNT_PENDING_APPROVAL, so letting them into the app would only produce
 * failing screens.
 */
export default function PendingApprovalPage() {
  const { profile, refresh, signOut } = useSession()
  const t = useT()
  const [checking, setChecking] = useState(false)
  const [stillPending, setStillPending] = useState(false)

  async function checkAgain() {
    setChecking(true)
    setStillPending(false)
    await refresh()
    // If it changed, the shell redirects and this never renders again.
    setStillPending(true)
    setChecking(false)
  }

  return (
    <div data-role={profile?.role} className="flex min-h-screen items-center justify-center px-4 py-8 sm:py-12">
      <div className="w-full max-w-md text-center">
        <Image src="/logo.png" alt={t('status.helpershob')} width={90} height={82} priority className="mx-auto h-auto" />

        <span className="mt-5 inline-flex rounded-full bg-warm px-3.5 py-1 text-xs font-semibold text-[#9a5b25]">
          {t('status.awaitingApproval')}
        </span>

        <h1 className="mt-4 text-2xl font-bold tracking-tight text-ink">
          {t('status.yourAccountIsUnderReview')}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-70">
          {profile?.role === 'service_provider'
            ? t('status.thanksForSubmittingYourDetailsOur')
            : t('status.yourAccountIsBeingReviewedYou')}
        </p>

        {stillPending && (
          <p className="mt-4 rounded-xl bg-warm px-4 py-3 text-sm text-[#9a5b25]">
            {t('status.stillAwaitingApprovalPleaseCheckBack')}
          </p>
        )}

        <div className="mt-7 space-y-3">
          <Button size="lg" fullWidth loading={checking} onClick={checkAgain}>
            {t('status.checkAgain')}
          </Button>
          <Button size="lg" variant="outline" fullWidth onClick={signOut}>
            {t('status.signOut')}
          </Button>
        </div>

        <p className="mt-7 text-xs text-ink-50">
          Need help?{' '}
          <a href="mailto:support@helpershob.com" className="font-semibold text-brand-deep hover:underline">
            support@helpershob.com
          </a>
        </p>
      </div>
    </div>
  )
}
