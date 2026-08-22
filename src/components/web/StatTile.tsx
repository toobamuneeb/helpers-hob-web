'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'

const ICONS: Record<string, string> = {
  wallet: 'M3 10h18M6 15h3M4 6h16a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V7a1 1 0 011-1z',
  briefcase: 'M9 6V5a2 2 0 012-2h2a2 2 0 012 2v1M3 9a1 1 0 011-1h16a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V9zm0 4h18',
  check: 'M20 6L9 17l-5-5',
  clock: 'M12 7v5l3 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z',
  spark: 'M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4L12 3z',
  star: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9L12 3.5z',
}

/**
 * Headline figure with an icon and its own accent.
 *
 * Home is the first thing both roles see; a row of these gives it something to
 * land on instead of an empty page with a list under it.
 */
export default function StatTile({
  label,
  value,
  sub,
  icon = 'spark',
  tone = 'accent',
  href,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  icon?: keyof typeof ICONS
  tone?: 'accent' | 'neutral' | 'warm' | 'blue'
  href?: string
}) {
  const tones = {
    accent: { bar: 'bg-accent-role', chip: 'bg-accent-soft text-accent-role', num: 'text-accent-role' },
    neutral: { bar: 'bg-line', chip: 'bg-surface-muted text-ink-70', num: 'text-ink' },
    warm: { bar: 'bg-[#e8a86b]', chip: 'bg-warm text-[#9a5b25]', num: 'text-[#9a5b25]' },
    blue: { bar: 'bg-secondary', chip: 'bg-[#e6f1f8] text-secondary', num: 'text-secondary' },
  }[tone]

  const body = (
    <>
      <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${tones.bar}`} />
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-50">{label}</p>
        <span aria-hidden className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${tones.chip}`}>
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
            <path d={ICONS[icon]} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </div>
      <p className={`mt-2 text-[1.6rem] font-bold leading-none tracking-tight tabular-nums ${tones.num}`}>
        {value}
      </p>
      {sub && <p className="mt-1.5 text-xs text-ink-50">{sub}</p>}
    </>
  )

  const shell =
    'relative overflow-hidden rounded-xl border border-line bg-surface px-5 py-4 shadow-[0_1px_2px_rgba(37,41,42,.04)]'

  return href ? (
    <Link href={href} className={`${shell} block transition-all hover:-translate-y-0.5 hover:border-accent-role hover:shadow-md`}>
      {body}
    </Link>
  ) : (
    <div className={shell}>{body}</div>
  )
}
