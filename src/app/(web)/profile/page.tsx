'use client'

import Link from 'next/link'
import { useSession } from '@/lib/web/session'
import { Avatar, Button, Card, PageTitle } from '@/components/web/ui'

export default function ProfilePage() {
  const { profile, isProvider, signOut } = useSession()
  if (!profile) return null

  const links = [
    { href: '/profile/edit', label: 'Edit profile', sub: 'Name, photo, contact details' },
    { href: '/profile/password', label: 'Change password', sub: 'Update your sign-in password' },
    { href: '/reviews', label: 'My reviews', sub: 'What people said about you' },
    ...(isProvider
      ? [
          { href: '/provider/earnings', label: 'Earnings', sub: 'Payments and payouts' },
          { href: '/provider/payouts', label: 'Payout account', sub: 'Your Stripe connection' },
        ]
      : [
          { href: '/payments', label: 'Payment history', sub: 'What you have paid, and for what' },
          { href: '/my-jobs', label: 'My job posts', sub: 'Jobs you posted publicly' },
          { href: '/offers', label: 'My sent offers', sub: 'Offers awaiting a response' },
        ]),
    { href: '/help', label: 'Help & support', sub: 'Questions and contact' },
    { href: '/privacy-policy', label: 'Privacy policy', sub: 'How we handle your data' },
  ]

  return (
    <div className="space-y-5">
      <PageTitle title="Profile" />

      <Card>
        <div className="flex items-center gap-4">
          <Avatar src={profile.profile_image_url} name={profile.name ?? profile.email} size="lg" />
          <div className="min-w-0">
            <p className="truncate text-lg font-bold text-ink">{profile.name ?? profile.email}</p>
            <p className="truncate text-sm text-ink-70">{profile.email}</p>
            <p className="mt-1 text-xs font-semibold text-accent-role">
              {isProvider ? 'Service provider' : 'Customer'}
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

      <Button variant="outline" fullWidth onClick={signOut}>Sign out</Button>
    </div>
  )
}
