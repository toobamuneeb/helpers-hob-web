'use client'

import { Suspense, use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { api } from '@/lib/web/api'
import { useSession } from '@/lib/web/session'
import MapView from '@/components/web/MapView'
import {
  Avatar, BackLink, Badge, Button, Card, ErrorNote, Spinner, Thumb, date, money, time,
} from '@/components/web/ui'
import { useT } from '@/lib/i18n'
import JobPhotos from '@/components/web/JobPhotos'

interface JobPost {
  job_id: string
  job_title: string | null
  post_status: string
  customer_id: string | null
  service_description: string
  service_date: string
  service_time: string
  service_duration: string | null
  location_address: string | null
  location_lat: number | string | null
  location_lng: number | string | null
  payment_amount: string
  currency: string | null
  is_recurring: boolean | null
  recurrence_type: string | null
  image_url: string | null
  /** All photos, in order. image_url mirrors the first. */
  image_urls?: string[] | null
  customer?: { user_id: string; name: string | null; profile_image_url: string | null } | null
  skill?: { name: string; icon?: string | null; color?: string | null } | null
}

/**
 * A public job post — read two ways.
 *
 * A provider sees it before making an offer and can message the customer; the
 * customer who posted it sees their own listing and can close it, which is what
 * the mobile JobDetail does for source 'myjobs'.
 */
function JobPost({ jobId }: { jobId: string }) {
  const t = useT()
  const router = useRouter()
  const search = useSearchParams()
  const { profile, loading: sessionLoading } = useSession()

  const [job, setJob] = useState<JobPost | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const res = await api.get<JobPost>(`/jobs/posts/${jobId}`)
    if (res.success && res.data) { setJob(res.data); setError(null) }
    else setError(res.error ?? t('jobs.couldNotLoadThisJob'))
    setLoading(false)
  }, [jobId])

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(() => { if (!cancelled) void load() }, 0)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [load])

  async function closePost() {
    if (!window.confirm('Close this job post? Providers will no longer see it.')) return
    setBusy(true)
    const res = await api.post('/jobs/posts/close', { job_id: jobId })
    if (!res.success) setError(res.error ?? t('jobs.couldNotCloseTheJob'))
    else await load()
    setBusy(false)
  }

  async function message() {
    if (!job?.customer) return
    setBusy(true)
    // Both ids, for the same reason: the route takes no session.
    const res = await api.post<{ chat_id?: string }>('/chat/create', {
      customer_id: job.customer.user_id,
      service_provider_id: profile?.user_id,
      job_id: job.job_id,
      job_title: job.job_title ?? undefined,
    })
    if (res.success && res.data?.chat_id) router.push(`/chats/${res.data.chat_id}`)
    else setError(res.error ?? t('jobs.couldNotStartTheChat'))
    setBusy(false)
  }

  if (loading || sessionLoading) return <Spinner />
  if (!job) return <ErrorNote>{error ?? t('jobs.jobNotFound')}</ErrorNote>

  // Whoever posted it sees their own listing, not the provider's view of it.
  const ownerId = job.customer_id ?? job.customer?.user_id ?? null
  const isOwner = !!profile && !!ownerId && profile.user_id === ownerId
  const back = search.get('from') === 'myjobs' || isOwner
    ? { href: '/my-jobs', label: t('jobs.backToMyJobs') }
    : { href: '/provider/home', label: t('jobs.backToJobs') }

  return (
    <div className="space-y-5">
      <BackLink href={back.href}>{back.label}</BackLink>
      {error && <ErrorNote>{error}</ErrorNote>}

      <Card bleed>
        <JobPhotos urls={job.image_urls ?? (job.image_url ? [job.image_url] : [])}
          skill={job.skill ?? undefined} variant="detail" className="h-64 w-full" />
        <div className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-xl font-bold tracking-tight text-ink">
                  {job.job_title ?? job.service_description}
                </h1>
                <Badge value={job.post_status} />
              </div>
              <p className="mt-1 text-sm text-ink-70">
                {date(job.service_date)} at {time(job.service_time)}
                {job.service_duration ? ` · ${job.service_duration}` : ''}
              </p>
              {job.is_recurring && (
                <span className="mt-2 inline-flex rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-ink">
                  {job.recurrence_type} series
                </span>
              )}
            </div>
            <p className="text-2xl font-bold tabular-nums text-ink">
              {money(job.payment_amount, job.currency ?? 'EUR')}
            </p>
          </div>
        </div>
      </Card>

      <Card title={t('jobs.location')}>
        <MapView lat={job.location_lat} lng={job.location_lng} address={job.location_address} />
      </Card>

      <Card title={t('jobs.details')}>
        <dl className="grid gap-4 sm:grid-cols-2">
          {([
            ['Skill', job.skill?.name ?? null],
            ['Duration', job.service_duration],
            ['Address', job.location_address],
          ] as [string, string | null][]).map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs font-semibold uppercase tracking-wide text-ink-50">{k}</dt>
              <dd className="mt-0.5 break-words text-sm text-ink-80">{v || '—'}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 border-t border-line-soft pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-50">{t('jobs.description')}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-ink-80">{job.service_description}</p>
        </div>
      </Card>

      {isOwner ? (
        job.post_status === 'open' && (
          <Card title={t('jobs.actions')}>
            <Button variant="outline" loading={busy} onClick={closePost}>{t('jobs.closeJobPost')}</Button>
            <p className="mt-3 text-xs text-ink-50">
              {t('jobs.closingHidesThePostFromProviders')}
            </p>
          </Card>
        )
      ) : job.customer && (
        <Card title={t('jobs.postedBy')}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="flex items-center gap-3">
              <Avatar src={job.customer.profile_image_url} name={job.customer.name} />
              <span className="min-w-0">
                <span className="block font-semibold text-ink">
                  {job.customer.name ?? t('jobs.customer')}
                </span>
                {/* A provider deciding whether to take the job can look the
                    customer up first, the same way a customer checks them. */}
                <Link href={`/customers/${job.customer.user_id}`}
                  className="text-sm font-semibold text-accent-role hover:underline">
                  {t('jobs.viewProfile')}
                </Link>
              </span>
            </span>
            <Button onClick={message} loading={busy}>{t('jobs.messageCustomer')}</Button>
          </div>
          <p className="mt-3 text-xs text-ink-50">
            {t('jobs.discussTheJobInChatThe')}
          </p>
        </Card>
      )}
    </div>
  )
}

export default function JobPostPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = use(params)
  return (
    <Suspense fallback={<Spinner />}>
      <JobPost jobId={jobId} />
    </Suspense>
  )
}
