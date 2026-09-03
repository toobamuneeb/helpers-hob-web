'use client'

import { Suspense } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useT } from '@/lib/i18n'


/** Mirrors the mobile RoleSelection screen: the two sides sign in separately. */
function RoleSelection() {
  const t = useT()
  const params = useSearchParams()
  const next = params.get('next') === 'login' ? 'login' : 'signup'

  const options = [
    {
      role: 'customer',
      title: t('auth.needHelpTitle'),
      body: t('auth.needHelpBody'),
      accent: 'ring-brand-tint bg-brand-soft text-brand-deep',
    },
    {
      role: 'service_provider',
      title: t('auth.wantWorkTitle'),
      body: t('auth.wantWorkBody'),
      accent: 'ring-[#b8d6e8] bg-[#e6f1f8] text-secondary',
    },
  ] as const

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-8 flex flex-col items-center">
          <Image src="/logo.png" alt={t('auth.helpershob')} width={80} height={73} priority className="h-auto" />
        </Link>

        <h1 className="text-center text-2xl font-bold tracking-tight text-ink">
          {t('auth.roleQuestion')}
        </h1>
        <p className="mt-1 text-center text-sm text-ink-70">
          {t('auth.roleHint')}
        </p>

        <div className="mt-8 space-y-3">
          {options.map((o) => (
            <Link
              key={o.role}
              href={`/${next}?role=${o.role}`}
              className="block rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-brand"
            >
              <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${o.accent}`}>
                {o.role === 'customer' ? t('common.customer') : t('common.serviceProvider')}
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
