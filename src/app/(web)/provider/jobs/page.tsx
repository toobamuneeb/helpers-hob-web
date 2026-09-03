'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { api } from '@/lib/web/api'
import { useJobActions, canStart, primaryAction } from '@/lib/web/useJobActions'
import BookingCard, { type OfferLike } from '@/components/web/BookingCard'
import { Button, Card, Empty, ErrorNote, PageTitle, CardSkeleton } from '@/components/web/ui'
import { useT } from '@/lib/i18n'

// The mobile Jobs screen's tabs. "Pending" is work accepted but not started;
// "Active" holds everything under way, right up to the customer's confirmation.
const TABS = [
  { id: 'pending', labelKey: 'jobs.pending' },
  { id: 'active', labelKey: 'jobs.active' },
  { id: 'completed', labelKey: 'jobs.completed' },
  { id: 'cancelled', labelKey: 'jobs.cancelled' },
] as const

const IN_TAB: Record<string, string[]> = {
  pending: ['scheduled'],
  active: ['pending', 'active', 'awaiting_confirmation'],
  completed: ['completed'],
  cancelled: ['canceled', 'cancelled'],
}

/** Provider's accepted work, with the status actions the lifecycle needs. */
function ProviderJobs() {
  const t = useT()
  const search = useSearchParams()
  // Coming back from a job's detail, land on the tab you left from.
  const wanted = search.get('tab')
  const [tab, setTab] = useState(
    TABS.some((item) => item.id === wanted) ? (wanted as string) : 'pending',
  )

  const [offers, setOffers] = useState<OfferLike[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // One unfiltered fetch, split by tab in the browser — Active spans three
  // statuses, so a per-status query cannot express it.
  const load = useCallback(async () => {
    const res = await api.get<OfferLike[]>('/offers?limit=100')
    if (res.success) { setOffers(Array.isArray(res.data) ? res.data : []); setLoadError(null) }
    else setLoadError(res.error ?? t('provider.couldNotLoadYourJobs'))
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
    // Marked complete already — the customer confirms and pays from here, so
    // there is nothing for the provider to press. Mobile hides its button at
    // this status too; without a word of explanation the card just looks stuck.
    if (o.offer_status === 'awaiting_confirmation') {
      return (
        <span className="text-xs font-semibold text-ink-50">
          {t('jobs.waitingForTheCustomerToConfirm')}
        </span>
      )
    }

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
      <PageTitle title={t('jobs.myJobs')} sub={t('jobs.workYouHaveAccepted')} />

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
        <Card><Empty title={t('jobs.nothingHere')}
          sub={t(`jobs.empty.${tab}`)} /></Card>
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
