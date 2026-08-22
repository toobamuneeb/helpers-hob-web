'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { api } from '@/lib/web/api'
import { useJobActions, canStart, primaryAction } from '@/lib/web/useJobActions'
import BookingCard, { type OfferLike } from '@/components/web/BookingCard'
import { Button, Card, Empty, ErrorNote, PageTitle, CardSkeleton } from '@/components/web/ui'

// The mobile Jobs screen's tabs. "Pending" is work accepted but not started;
// "Active" holds everything under way, right up to the customer's confirmation.
const TABS = [
  { id: 'pending', label: 'Pending' },
  { id: 'active', label: 'Active' },
  { id: 'completed', label: 'Completed' },
  { id: 'cancelled', label: 'Cancelled' },
]

const IN_TAB: Record<string, string[]> = {
  pending: ['scheduled'],
  active: ['pending', 'active', 'awaiting_confirmation'],
  completed: ['completed'],
  cancelled: ['canceled', 'cancelled'],
}

/** Provider's accepted work, with the status actions the lifecycle needs. */
function ProviderJobs() {
  const search = useSearchParams()
  // Coming back from a job's detail, land on the tab you left from.
  const wanted = search.get('tab')
  const [tab, setTab] = useState(
    TABS.some((t) => t.id === wanted) ? (wanted as string) : 'pending',
  )

  const [offers, setOffers] = useState<OfferLike[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // One unfiltered fetch, split by tab in the browser — Active spans three
  // statuses, so a per-status query cannot express it.
  const load = useCallback(async () => {
    const res = await api.get<OfferLike[]>('/offers?limit=100')
    if (res.success) { setOffers(Array.isArray(res.data) ? res.data : []); setLoadError(null) }
    else setLoadError(res.error ?? 'Could not load your jobs')
    setLoading(false)
  }, [])

  // Deferred by a tick so the fetch's setState lands outside the effect body,
  // and cancelled on unmount so a slow response cannot set state on a page the
  // user has already left.
  useEffect(() => {
    let cancelled = false
    const t = setTimeout(() => { if (!cancelled) void load() }, 0)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [load])

  const shown = useMemo(
    () => offers.filter((o) =>
      IN_TAB[tab]?.includes(o.offer_status) &&
      // An offer still waiting for this provider's answer lives on Pending
      // Offers; it is not work in hand.
      o.offer_job_status !== 'pending' &&
      o.offer_job_status !== 'rejected'),
    [offers, tab],
  )

  // The card's action runs the same gated flow as the detail screen — a job
  // paid through the platform still checks Stripe and the month's token here.
  const jobs = useJobActions(load)
  const error = loadError ?? jobs.error

  function actionsFor(o: OfferLike) {
    const next = primaryAction(o.offer_status)
    if (!next) return null
    const blocked = next[1] === 'start' && !canStart(o)
    return (
      <Button size="sm" loading={jobs.busyId === o.offer_id} disabled={blocked}
        onClick={() => void jobs.providerPrimary(o)}>
        {next[0]}
      </Button>
    )
  }

  return (
    <div className="space-y-5">
      <PageTitle title="My jobs" sub="Work you have accepted." />

      <div className="flex gap-1 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`whitespace-nowrap rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors ${
              tab === t.id ? 'bg-accent-role text-accent-on' : 'text-ink-70 ring-1 ring-inset ring-line hover:bg-accent-soft'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      {loading ? <CardSkeleton /> : shown.length === 0 ? (
        <Card><Empty title="Nothing here"
          sub={`No ${TABS.find((t) => t.id === tab)?.label.toLowerCase()} jobs.`} /></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((o) => (
            <BookingCard key={o.offer_id} offer={o} role="service_provider"
              href={`/jobs/${o.offer_id}?from=jobs&tab=${tab}`} actions={actionsFor(o)} />
          ))}
        </div>
      )}

      {jobs.dialogs}
    </div>
  )
}

export default function ProviderJobsPage() {
  return <Suspense fallback={<CardSkeleton />}><ProviderJobs /></Suspense>
}
