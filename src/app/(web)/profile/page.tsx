'use client'

import Link from 'next/link'
import { useSession } from '@/lib/web/session'
import { Avatar, Button, Card, PageTitle } from '@/components/web/ui'
import { useT } from '@/lib/i18n'

export default function ProfilePage() {
  const t = useT()
  const { profile, isProvider, signOut } = useSession()
  if (!profile) return null

  const links = [
    { href: '/profile/edit', label: t('profile.editProfile'), sub: t('profile.namePhotoContactDetails') },
    { href: '/profile/password', label: t('profile.changePassword'), sub: t('profile.updateYourSignInPassword') },
    { href: '/reviews', label: t('profile.myReviews'), sub: t('profile.whatPeopleSaidAboutYou') },
    ...(isProvider
      ? [
          { href: '/provider/earnings', label: t('profile.earnings'), sub: t('profile.paymentsAndPayouts') },
          { href: '/provider/payouts', label: t('profile.payoutAccount'), sub: t('profile.yourStripeConnection') },
        ]
      : [
          { href: '/payments', label: t('profile.paymentHistory'), sub: t('profile.whatYouHavePaidAndFor') },
          { href: '/my-jobs', label: t('profile.myJobPosts'), sub: t('profile.jobsYouPostedPublicly') },
          { href: '/offers', label: t('profile.mySentOffers'), sub: t('profile.offersAwaitingAResponse') },
        ]),
    { href: '/help', label: t('profile.helpSupport'), sub: t('profile.questionsAndContact') },
    { href: '/privacy-policy', label: t('profile.privacyPolicy'), sub: t('profile.howWeHandleYourData') },
  ]

  return (
    <div className="space-y-5">
      <PageTitle title={t('profile.profile')} />

      <Card>
        <div className="flex items-center gap-4">
          <Avatar src={profile.profile_image_url} name={profile.name ?? profile.email} size="lg" />
          <div className="min-w-0">
            <p className="truncate text-lg font-bold text-ink">{profile.name ?? profile.email}</p>
            <p className="truncate text-sm text-ink-70">{profile.email}</p>
            <p className="mt-1 text-xs font-semibold text-accent-role">
              {isProvider ? t('profile.serviceProvider') : t('profile.customer')}
            </p>
          </div>
        </div>
      </Card>

      <Card bleed>
        <ul className="divide-y divide-line-soft">
          {links.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="flex items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-accent-soft">
                <span>
                  <span className="block font-semibold text-ink">{l.label}</span>
                  <span className="block text-xs text-ink-50">{l.sub}</span>
                </span>
                <span className="text-ink-50">→</span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <Button variant="outline" fullWidth onClick={signOut}>{t('profile.signOut')}</Button>
    </div>
  )
}
