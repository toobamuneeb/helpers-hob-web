'use client'

import Link from 'next/link'
import { Avatar, Badge, Thumb, date, money } from './ui'

/** Shape the offer RPCs return; fields vary by endpoint, so most are optional. */
export interface OfferLike {
  offer_id: string
  offer_title?: string | null
  service_description?: string | null
  offer_status: string
  offer_job_status?: string | null
  service_date?: string | null
  service_time?: string | null
  service_duration?: string | null
  payment_amount?: string | number | null
  currency?: string | null
  is_recurring?: boolean | null
  occurrence_number?: number | null
  pay_through_platform?: boolean | null
  image_url?: string | null
  skill_name?: string | null
  customer_name?: string | null
  customer_avatar?: string | null
  provider_name?: string | null
  provider_avatar?: string | null
}

/**
 * One booking, used by the customer's Bookings list and the provider's Jobs
 * list — the mobile CustomBookingCard serves both the same way.
 */
export default function BookingCard({
  offer,
  role,
  href,
  actions,
  badge,
}: {
  offer: OfferLike
  role: 'customer' | 'service_provider'
  href: string
  actions?: React.ReactNode
  /** Replaces the offer_status badge — the Offers list shows the reply status. */
  badge?: React.ReactNode
}) {
  // Each side sees the other party.
  const personName = role === 'customer' ? offer.provider_name : offer.customer_name
  const personAvatar = role === 'customer' ? offer.provider_avatar : offer.customer_avatar

  return (
    <div className="group overflow-hidden rounded-xl border border-line bg-surface transition-all hover:-translate-y-0.5 hover:border-accent-role hover:shadow-md">
      {offer.image_url && <Thumb src={offer.image_url} className="h-32 w-full" />}

      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <Link href={href} className="min-w-0 flex-1">
            <p className="truncate font-bold tracking-tight text-ink transition-colors group-hover:text-accent-role">
              {offer.offer_title ?? offer.service_description ?? offer.skill_name ?? 'Booking'}
            </p>
          </Link>
          {badge ?? <Badge value={offer.offer_status} />}
        </div>

        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-50">
          {offer.service_date && <span>{date(offer.service_date)}</span>}
          {offer.service_duration && <span>{offer.service_duration}</span>}
          {offer.skill_name && <span>{offer.skill_name}</span>}
        </div>

        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {offer.is_recurring && (
            <span className="rounded bg-accent-soft px-1.5 py-px text-[0.65rem] font-semibold text-ink">
              recurring{offer.occurrence_number ? ` #${offer.occurrence_number}` : ''}
            </span>
          )}
          {offer.pay_through_platform === false && (
            <span className="rounded bg-warm px-1.5 py-px text-[0.65rem] font-semibold text-[#9a5b25]">
              cash
            </span>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line-soft pt-3">
          <span className="flex min-w-0 items-center gap-2">
            <Avatar src={personAvatar} name={personName} size="sm" />
            <span className="truncate text-sm text-ink-70">{personName ?? '—'}</span>
          </span>
          <span className="shrink-0 font-bold tabular-nums text-ink">
            {money(offer.payment_amount, offer.currency ?? 'EUR')}
          </span>
        </div>

        {actions && (
          <div className="mt-3 flex flex-col gap-2 xs:flex-row xs:flex-wrap [&>*]:w-full xs:[&>*]:w-auto">
            {actions}
          </div>
        )}
      </div>
    </div>
  )
}
