'use client'

import { Suspense } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

/** Mirrors the mobile RoleSelection screen: the two sides sign in separately. */
function RoleSelection() {
  const params = useSearchParams()
  const next = params.get('next') === 'login' ? 'login' : 'signup'

  const options = [
    {
      role: 'customer',
      title: 'I need help',
      body: 'Post a job or hire a professional directly.',
      accent: 'ring-brand-tint bg-brand-soft text-brand-deep',
    },
    {
      role: 'service_provider',
      title: 'I want to work',
      body: 'Offer your skills, take bookings and get paid.',
      accent: 'ring-[#b8d6e8] bg-[#e6f1f8] text-secondary',
    },
  ] as const

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-8 flex flex-col items-center">
          <Image src="/logo.png" alt="HelpersHob" width={80} height={73} priority className="h-auto" />
        </Link>

        <h1 className="text-center text-2xl font-bold tracking-tight text-ink">
          How will you use HelpersHob?
        </h1>
        <p className="mt-1 text-center text-sm text-ink-70">
          You can only pick one — accounts are separate.
        </p>

        <div className="mt-8 space-y-3">
          {options.map((o) => (
            <Link
              key={o.role}
              href={`/${next}?role=${o.role}`}
              className="block rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-brand"
            >
              <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${o.accent}`}>
                {o.role === 'customer' ? 'Customer' : 'Service provider'}
              </span>
              <p className="mt-3 text-lg font-bold text-ink">{o.title}</p>
              <p className="mt-0.5 text-sm text-ink-70">{o.body}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function RolePage() {
  return (
    <Suspense fallback={null}>
      <RoleSelection />
    </Suspense>
  )
}
