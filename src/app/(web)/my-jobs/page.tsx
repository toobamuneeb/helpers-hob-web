'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/web/api'
import { Badge, Button, Card, Empty, ErrorNote, PageTitle, CardSkeleton, Thumb, date, money } from '@/components/web/ui'
import { useT } from '@/lib/i18n'
import JobPhotos from '@/components/web/JobPhotos'

interface JobPost {
  job_id: string
  job_title: string | null
  service_description: string
  post_status: string
  service_date: string | null
  service_duration: string | null
  payment_amount: string
  currency: string | null
  image_url: string | null
  /** All photos, in order. image_url mirrors the first. */
  image_urls?: string[] | null
  skill_name?: string | null
  skill_color?: string | null
  is_recurring?: boolean | null
}

/** The customer's own public job posts (distinct from booked offers). */
export default function MyJobsPage() {
  const t = useT()
  const [jobs, setJobs] = useState<JobPost[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [closing, setClosing] = useState<string | null>(null)

  async function load() {
    const res = await api.get<JobPost[]>('/jobs/posts?limit=50')
    if (res.success) { setJobs(Array.isArray(res.data) ? res.data : []); setError(null) }
    else setError(res.error ?? t('jobs.couldNotLoadYourJobs'))
    setLoading(false)
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
  }, [])

  async function close(jobId: string) {
    if (!window.confirm('Close this job post? Providers will no longer see it.')) return
    setClosing(jobId)
    const res = await api.post('/jobs/posts/close', { job_id: jobId })
    if (!res.success) setError(res.error ?? t('jobs.couldNotCloseTheJob'))
    else await load()
    setClosing(null)
  }

  return (
    <div className="space-y-5">
      <PageTitle title={t('jobs.myJobs')} sub={t('jobs.jobsYouPostedPublicly')}
        action={<Link href="/post-job"><Button>{t('jobs.postAJob')}</Button></Link>} />

      {error && <ErrorNote>{error}</ErrorNote>}

      {loading ? <CardSkeleton /> : jobs.length === 0 ? (
        <Card>
          <Empty title={t('jobs.noJobPostsYet')}
            sub={t('jobs.postAJobAndProvidersNear')}
            action={<Link href="/post-job"><Button>{t('jobs.postAJob')}</Button></Link>} />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {jobs.map((j) => (
            <div key={j.job_id}
              className="group overflow-hidden rounded-xl border border-line bg-surface transition-all hover:-translate-y-0.5 hover:border-accent-role hover:shadow-md">
              {/* The card opens the post, the way the mobile My Jobs list does.
                  Close stays outside the link so it is not swallowed by it. */}
              <Link href={`/jobs/post/${j.job_id}?from=myjobs`} className="block">
                <JobPhotos urls={j.image_urls ?? (j.image_url ? [j.image_url] : [])}
                  skill={{ name: j.skill_name, color: j.skill_color }} className="h-32 w-full" />
                <div className="p-4 pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 flex-1 truncate font-semibold text-ink transition-colors group-hover:text-accent-role">
                      {j.job_title ?? j.service_description}
                    </p>
                    <Badge value={j.post_status} />
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-ink-50">
                    {j.service_date && <span>{date(j.service_date)}</span>}
                    {j.service_duration && <span>{j.service_duration}</span>}
                    {j.skill_name && <span>{j.skill_name}</span>}
                  </div>
                </div>
              </Link>
              <div className="mx-4 mt-3 flex items-center justify-between border-t border-line-soft py-3">
                <span className="font-bold tabular-nums text-ink">
                  {money(j.payment_amount, j.currency ?? 'EUR')}
                </span>
                {j.post_status === 'open' && (
                  <Button size="sm" variant="outline" loading={closing === j.job_id}
                    onClick={() => close(j.job_id)}>{t('jobs.closeJob')}</Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
