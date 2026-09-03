'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/web/api'
import { useSession } from '@/lib/web/session'
import StatTile from '@/components/web/StatTile'
import {
  Avatar, Button, Card, Empty, ErrorNote, PageTitle, CardSkeleton, Thumb, date, money,
} from '@/components/web/ui'
import { useT } from '@/lib/i18n'
import JobPhotos from '@/components/web/JobPhotos'

interface Earnings { total_earned?: number; pending_amount?: number; currency?: string }

interface ActiveOffer {
  offer_id: string
  offer_title?: string | null
  service_description?: string | null
  offer_status: string
  service_date?: string | null
  payment_amount?: string | number | null
  currency?: string | null
}

interface FeedJob {
  job_id: string
  job_title: string | null
  service_description: string
  payment_amount: string
  location_address: string | null
  service_date: string | null
  service_duration?: string | null
  skill_name: string | null
  skill_color: string | null
  customer_id: string
  customer_name: string | null
  customer_avatar: string | null
  is_recurring: boolean | null
  image_url: string | null
  /** All photos, in order. image_url mirrors the first. */
  image_urls?: string[] | null
  distance_km: number | null
}


/** The mobile home's filter steps, in the same order, ending in "All". */
const DISTANCES: { labelKey: string; value: number | null }[] = [
  { labelKey: 'provider.km5', value: 5 },
  { labelKey: 'provider.km10', value: 10 },
  { labelKey: 'provider.km15', value: 15 },
  { labelKey: 'provider.km25', value: 25 },
  { labelKey: 'provider.km50', value: 50 },
  { labelKey: 'provider.all', value: null },
]

/** Provider home: the open job feed, distance-filtered by the API. */
export default function ProviderHomePage() {
  const { profile } = useSession()
  const t = useT()
  const [jobs, setJobs] = useState<FeedJob[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [skipping, setSkipping] = useState<string | null>(null)
  const [earnings, setEarnings] = useState<Earnings | null>(null)
  const [active, setActive] = useState<ActiveOffer | null>(null)

  // Same options and same default as the mobile home screen: no filter until
  // the provider picks one.
  const [distance, setDistance] = useState<number | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  const PAGE = 20

  // A provider with no saved coordinates cannot be distance-filtered at all —
  // say so rather than silently ignoring the chip they just pressed.
  const lat = profile?.location_lat ?? null
  const lng = profile?.location_lng ?? null
  const noLocation = lat == null || lng == null

  /**
   * One page of the feed.
   *
   * The distance filter is the API's, not this screen's: it only narrows when
   * user_lat, user_lng and max_distance all arrive together, which is why a
   * provider with no saved location gets everything however the chips are set.
   */
  const fetchFeed = useCallback(
    async (offset: number, km: number | null) => {
      const params: Record<string, string | number | boolean | null | undefined> = {
        limit: PAGE,
        offset,
      }
      if (km && lat != null && lng != null) {
        params.user_lat = lat
        params.user_lng = lng
        params.max_distance = km
      }
      return api.get<FeedJob[]>(`/jobs/feed${api.qs(params)}`)
    },
    [lat, lng],
  )

  const load = useCallback(async () => {
    // The mobile home shows earnings and the job in progress alongside the feed.
    const [feed, earn, act] = await Promise.all([
      fetchFeed(0, distance),
      api.get<Earnings>('/payments/earnings'),
      api.get<ActiveOffer[]>('/offers?status=active&limit=1'),
    ])
    if (feed.success) {
      setJobs(Array.isArray(feed.data) ? feed.data : [])
      setHasMore(feed.pagination?.has_more === true)
      setError(null)
    } else setError(feed.error ?? t('provider.couldNotLoadTheJobFeed'))
    if (earn.success && earn.data) setEarnings(earn.data)
    if (act.success && Array.isArray(act.data) && act.data.length > 0) setActive(act.data[0])
    setLoading(false)
  }, [fetchFeed, distance])

  /** Append the next page — the web's equivalent of the mobile list's paging. */
  async function loadMore() {
    setLoadingMore(true)
    const res = await fetchFeed(jobs.length, distance)
    if (res.success && Array.isArray(res.data)) {
      setJobs((prev) => [...prev, ...res.data!])
      setHasMore(res.pagination?.has_more === true)
    } else setError(res.error ?? t('provider.couldNotLoadMoreJobs'))
    setLoadingMore(false)
  }

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

  async function skip(jobId: string) {
    setSkipping(jobId)
    const res = await api.post('/jobs/skip', { job_id: jobId })
    if (!res.success) setError(res.error ?? t('provider.couldNotSkipThisJob'))
    else setJobs((j) => j.filter((x) => x.job_id !== jobId))
    setSkipping(null)
  }

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-accent-soft via-canvas to-warm p-6 sm:p-8">
        <p className="text-sm font-medium text-ink-70">{t('provider.welcomeBack')}</p>
        <h1 className="mt-0.5 text-[1.75rem] font-bold leading-tight tracking-[-0.02em] text-ink">
          {profile?.name ?? 'there'}
        </h1>
        <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ink-70">
          {t('provider.openJobsNearYouMatchedTo')}
        </p>
      </section>

      <div className="grid gap-3 xs:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        <StatTile
          label={t('provider.totalEarnings')} icon="wallet" tone="accent" href="/provider/earnings"
          value={money(earnings?.total_earned ?? 0, earnings?.currency ?? 'EUR')}
          sub={t('provider.viewAll')}
        />
        <StatTile
          label={t('provider.pending')} icon="clock" tone="warm" href="/provider/payouts"
          value={money(earnings?.pending_amount ?? 0, earnings?.currency ?? 'EUR')}
          sub={t('provider.beingProcessed')}
        />
        <StatTile
          label={t('provider.activeJob')} icon="spark" tone="blue"
          href={active ? `/jobs/${active.offer_id}?from=jobs` : '/provider/jobs'}
          value={active ? money(active.payment_amount, active.currency ?? 'EUR') : '—'}
          sub={active ? (active.offer_title ?? t('provider.inProgress')) : t('provider.nothingInProgress')}
        />
        <StatTile
          label={t('provider.availableJobs')} icon="briefcase" tone="neutral"
          value={jobs.length}
          sub={t('provider.openNearYou')}
        />
      </div>

      <PageTitle title={t('provider.availableJobs')} sub={t('provider.openPostsFromCustomersNearYou')} />

      {error && <ErrorNote>{error}</ErrorNote>}

      {/* Same steps as the mobile home's filter row, "All" included. */}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {DISTANCES.map((d) => (
          <button
            key={d.labelKey}
            type="button"
            onClick={() => setDistance(d.value)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
              distance === d.value
                ? 'bg-accent-role text-white'
                : 'bg-surface text-ink-70 ring-1 ring-inset ring-line hover:text-ink'
            }`}
          >
            {t(d.labelKey)}
          </button>
        ))}
      </div>
      {noLocation && distance !== null && (
        <p className="-mt-2 text-xs text-ink-50">
          {t('provider.addYourWorkLocationInYour')}
        </p>
      )}

      {loading ? <CardSkeleton /> : jobs.length === 0 ? (
        <Card><Empty title={t('provider.noOpenJobsRightNow')}
          sub={t('provider.newPostsNearYouWillAppear')} /></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {jobs.map((j) => (
            <div key={j.job_id} className="overflow-hidden rounded-xl border border-line bg-surface transition-all hover:-translate-y-0.5 hover:border-accent-role hover:shadow-md">
              <JobPhotos urls={j.image_urls ?? (j.image_url ? [j.image_url] : [])}
                skill={{ name: j.skill_name, color: j.skill_color }} className="h-32 w-full" />
              <div className="p-4">
                {j.skill_name && (
                  <span className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold text-ink"
                    style={{ backgroundColor: j.skill_color ?? '#EEFFF2' }}>{j.skill_name}</span>
                )}
                <p className="mt-2 truncate font-semibold text-ink">
                  {j.job_title ?? j.service_description}
                </p>
                <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-ink-50">
                  {j.service_date && <span>{date(j.service_date)}</span>}
                  {j.service_duration && <span>{j.service_duration}</span>}
                  {j.distance_km !== null && <span>{j.distance_km.toFixed(1)} km away</span>}
                </div>
                {j.location_address && (
                  <p className="mt-1 truncate text-xs text-ink-50">{j.location_address}</p>
                )}

                <div className="mt-3 flex items-center justify-between border-t border-line-soft pt-3">
                  <span className="flex min-w-0 items-center gap-2">
                    <Avatar src={j.customer_avatar} name={j.customer_name} size="sm" />
                    <span className="truncate text-sm text-ink-70">{j.customer_name ?? t('provider.customer')}</span>
                  </span>
                  <span className="shrink-0 font-bold tabular-nums text-ink">{money(j.payment_amount)}</span>
                </div>

                <div className="mt-3 flex gap-2">
                  <Link href={`/jobs/post/${j.job_id}`} className="flex-1">
                    <Button size="sm" fullWidth>{t('provider.viewJob')}</Button>
                  </Link>
                  <Button size="sm" variant="outline" loading={skipping === j.job_id}
                    onClick={() => skip(j.job_id)}>{t('provider.skipJob')}</Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {hasMore && !loading && (
        <div className="flex justify-center">
          <Button variant="outline" loading={loadingMore} onClick={loadMore}>
            {t('provider.loadMoreJobs')}
          </Button>
        </div>
      )}
    </div>
  )
}
