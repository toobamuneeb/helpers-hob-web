'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { api } from '@/lib/web/api'
import BookingCard, { type OfferLike } from '@/components/web/BookingCard'
import { Card, Empty, ErrorNote, PageTitle, CardSkeleton } from '@/components/web/ui'
import { useT } from '@/lib/i18n'

// The mobile Bookings screen's tabs, in its order.
const TABS = [
  { id: 'scheduled', labelKey: 'bookings.scheduled' },
  { id: 'pending', labelKey: 'bookings.pending' },
  { id: 'active', labelKey: 'bookings.active' },
  { id: 'completed', labelKey: 'bookings.completed' },
  { id: 'cancelled', labelKey: 'bookings.cancelled' },
] as const

/**
 * offer_status → tab, copied from the mobile screen's STATUS_TAB_MAP.
 *
 * Note 'pending' here means the provider has accepted and is on the way, not an
 * offer waiting for a reply — those two share a status and are told apart by
 * offer_job_status below.  'awaiting_confirmation' folds into Active, because
 * the work is done but the booking is not closed until the customer confirms.
 */
const TAB_OF: Record<string, string> = {
  scheduled: 'scheduled',
  pending: 'pending',
  active: 'active',
  awaiting_confirmation: 'active',
  completed: 'completed',
  canceled: 'cancelled',
  cancelled: 'cancelled',
}

function Bookings() {
  const t = useT()
  const search = useSearchParams()
  // Coming back from a booking's detail, land on the tab you left from.
  const wanted = search.get('tab')
  const [tab, setTab] = useState(
    TABS.some((item) => item.id === wanted) ? (wanted as string) : 'scheduled',
  )

  const [offers, setOffers] = useState<OfferLike[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // One unfiltered fetch, then split by tab in the browser — the same thing the
  // mobile screen does, and the only way to get Active to hold two statuses.
  const load = useCallback(async () => {
    const res = await api.get<OfferLike[]>('/offers?limit=100')
    if (res.success) { setOffers(Array.isArray(res.data) ? res.data : []); setError(null) }
    else setError(res.error ?? t('bookings.couldNotLoadYourBookings'))
    setLoading(false)
  }, [])

  // Deferred by a tick so the fetch's setState lands outside the effect body,
  // and cancelled on unmount so a slow response cannot set state on a page the
  // user has already left.
  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(() => { if (!cancelled) void load() }, 0)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [load])

  const shown = useMemo(
    () => offers.filter((o) =>
      TAB_OF[o.offer_status] === tab &&
      // An offer nobody has answered, or one that was turned down, belongs to
      // My Sent Offers — it is not a booking.
      o.offer_job_status !== 'pending' &&
      o.offer_job_status !== 'rejected'),
    [offers, tab],
  )

  return (
    <div className="space-y-5">
      <PageTitle title={t('bookings.bookings')} sub={t('bookings.jobsYouHaveBookedWithProviders')} />

      <div className="flex gap-1 overflow-x-auto pb-1">
        {TABS.map((item) => (
          <button key={item.id} onClick={() => setTab(item.id)}
            className={`whitespace-nowrap rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors ${
              tab === item.id ? 'bg-accent-role text-accent-on' : 'text-ink-70 ring-1 ring-inset ring-line hover:bg-accent-soft'}`}>
            {t(item.labelKey)}
          </button>
        ))}
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      {loading ? <CardSkeleton /> : shown.length === 0 ? (
        <Card><Empty title={t('bookings.nothingHere')}
          sub={t(`bookings.empty.${tab}`)} /></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((o) => (
            <BookingCard key={o.offer_id} offer={o} role="customer"
              href={`/jobs/${o.offer_id}?from=bookings&tab=${tab}`} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function BookingsPage() {
  return <Suspense fallback={<CardSkeleton />}><Bookings /></Suspense>
}
