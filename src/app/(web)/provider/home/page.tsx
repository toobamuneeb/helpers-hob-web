'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/web/api'
import { useSession } from '@/lib/web/session'
import StatTile from '@/components/web/StatTile'
import {
  Avatar, Button, Card, Empty, ErrorNote, PageTitle, CardSkeleton, Thumb, date, money,
} from '@/components/web/ui'

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
  distance_km: number | null
}

/** Provider home: the open job feed, distance-filtered by the API. */
export default function ProviderHomePage() {
  const { profile } = useSession()
  const [jobs, setJobs] = useState<FeedJob[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [skipping, setSkipping] = useState<string | null>(null)
  const [earnings, setEarnings] = useState<Earnings | null>(null)
  const [active, setActive] = useState<ActiveOffer | null>(null)

  const load = useCallback(async () => {
    // The mobile home shows earnings and the job in progress alongside the feed.
    const [feed, earn, act] = await Promise.all([
      api.get<FeedJob[]>('/jobs/feed?limit=50'),
      api.get<Earnings>('/payments/earnings'),
      api.get<ActiveOffer[]>('/offers?status=active&limit=1'),
    ])
    if (feed.success) { setJobs(Array.isArray(feed.data) ? feed.data : []); setError(null) }
    else setError(feed.error ?? 'Could not load the job feed')
    if (earn.success && earn.data) setEarnings(earn.data)
    if (act.success && Array.isArray(act.data) && act.data.length > 0) setActive(act.data[0])
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

  async function skip(jobId: string) {
    setSkipping(jobId)
    const res = await api.post('/jobs/skip', { job_id: jobId })
    if (!res.success) setError(res.error ?? 'Could not skip this job')
    else setJobs((j) => j.filter((x) => x.job_id !== jobId))
    setSkipping(null)
  }

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-accent-soft via-canvas to-warm p-6 sm:p-8">
        <p className="text-sm font-medium text-ink-70">Welcome back</p>
        <h1 className="mt-0.5 text-[1.75rem] font-bold leading-tight tracking-[-0.02em] text-ink">
          {profile?.name ?? 'there'}
        </h1>
        <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ink-70">
          Open jobs near you, matched to your skills and travel distance.
        </p>
      </section>

      <div className="grid gap-3 xs:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        <StatTile
          label="Total Earnings" icon="wallet" tone="accent" href="/provider/earnings"
          value={money(earnings?.total_earned ?? 0, earnings?.currency ?? 'EUR')}
          sub="View All →"
        />
        <StatTile
          label="Pending" icon="clock" tone="warm" href="/provider/payouts"
          value={money(earnings?.pending_amount ?? 0, earnings?.currency ?? 'EUR')}
          sub="Being processed"
        />
        <StatTile
          label="Active Job" icon="spark" tone="blue"
          href={active ? `/jobs/${active.offer_id}?from=jobs` : '/provider/jobs'}
          value={active ? money(active.payment_amount, active.currency ?? 'EUR') : '—'}
          sub={active ? (active.offer_title ?? 'In progress') : 'Nothing in progress'}
        />
        <StatTile
          label="Available Jobs" icon="briefcase" tone="neutral"
          value={jobs.length}
          sub="Open near you"
        />
      </div>

      <PageTitle title="Available Jobs" sub="Open posts from customers near you." />

      {error && <ErrorNote>{error}</ErrorNote>}

      {loading ? <CardSkeleton /> : jobs.length === 0 ? (
        <Card><Empty title="No open jobs right now"
          sub="New posts near you will appear here. Check back soon." /></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {jobs.map((j) => (
            <div key={j.job_id} className="overflow-hidden rounded-xl border border-line bg-surface transition-all hover:-translate-y-0.5 hover:border-accent-role hover:shadow-md">
              {j.image_url && <Thumb src={j.image_url} className="h-32 w-full" />}
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
                    <span className="truncate text-sm text-ink-70">{j.customer_name ?? 'Customer'}</span>
                  </span>
                  <span className="shrink-0 font-bold tabular-nums text-ink">{money(j.payment_amount)}</span>
                </div>

                <div className="mt-3 flex gap-2">
                  <Link href={`/jobs/post/${j.job_id}`} className="flex-1">
                    <Button size="sm" fullWidth>View Job</Button>
                  </Link>
                  <Button size="sm" variant="outline" loading={skipping === j.job_id}
                    onClick={() => skip(j.job_id)}>Skip Job</Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
