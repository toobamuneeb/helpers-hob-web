'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import { api } from '@/lib/web/api'
import { useSession } from '@/lib/web/session'
import {
  Avatar, BackLink, Card, Empty, ErrorNote, Spinner, date,
} from '@/components/web/ui'
import { useT } from '@/lib/i18n'

/** Shape of get_customer_profile, which /api/profiles/customer/[id] returns. */
interface CustomerProfile {
  user_id: string
  name: string | null
  profile_image_url: string | null
  introduction: string | null
  phone: string | null
  country: string | null
  state: string | null
  total_jobs_posted: number | null
  average_rating: number | null
  total_reviews: number | null
}

/**
 * A row from /reviews/[userId].
 *
 * The score is named after the side that gave it, not the side reading it:
 * get_provider_reviews returns customer_rating, get_customer_reviews returns
 * provider_rating, and the date is review_date in both. Reading `rating` and
 * `created_at` — which neither returns — is why reviews rendered as a dash with
 * no date and the average came out as zero.
 */
interface Review {
  review_id: string
  customer_rating?: number | null
  provider_rating?: number | null
  review_title: string | null
  review_text: string | null
  reviewer_name: string | null
  review_date: string
}

/** Whichever of the two the endpoint filled in for this reader. */
function scoreOf(r: Review): number | null {
  return r.provider_rating ?? r.customer_rating ?? null
}

/**
 * A customer as their provider sees them — the other half of
 * /providers/[providerId], so both sides of a booking can look each other up.
 *
 * Providers only: a customer has no reason to browse other customers, and the
 * endpoint behind this is meant for the person doing the work.
 */
export default function CustomerProfilePage({
  params,
}: {
  params: Promise<{ customerId: string }>
}) {
  const { customerId } = use(params)
  const t = useT()
  const router = useRouter()
  const { profile, isProvider, loading: sessionLoading } = useSession()

  const [customer, setCustomer] = useState<CustomerProfile | null>(null)
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Own profile lives under /profile; nobody needs two versions of it.
  const isSelf = profile?.user_id === customerId

  useEffect(() => {
    if (sessionLoading) return
    if (!isProvider || isSelf) { router.replace('/profile'); return }

    let cancelled = false
    void (async () => {
      const [p, r] = await Promise.all([
        api.get<CustomerProfile>(`/profiles/customer/${customerId}`),
        api.get<Review[]>(`/reviews/${customerId}?role=customer&limit=10`),
      ])
      if (cancelled) return
      if (p.success && p.data) setCustomer(p.data)
      else setError(p.error ?? t('providers.couldNotLoadThisCustomer'))
      if (r.success && Array.isArray(r.data)) setReviews(r.data)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [customerId, isProvider, isSelf, sessionLoading, router])

  if (sessionLoading || loading) return <Spinner />
  if (error) return <div className="space-y-4"><ErrorNote>{error}</ErrorNote></div>
  if (!customer) return null

  const place = [customer.state, customer.country].filter(Boolean).join(', ')

  return (
    <div className="space-y-5">
      <BackLink href="/provider/jobs">{t('providers.backToJobs')}</BackLink>

      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <Avatar src={customer.profile_image_url} name={customer.name} size="lg" />

          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold tracking-tight text-ink">
              {customer.name ?? t('providers.customer')}
            </h1>
            {place && <p className="mt-0.5 text-sm text-ink-50">{place}</p>}

            <p className="mt-2 text-sm text-ink-70">
              {customer.average_rating != null
                ? `★ ${customer.average_rating.toFixed(1)}`
                : t('providers.noRatingYet')}
              {customer.total_reviews ? ` · ${customer.total_reviews} reviews` : ''}
              {customer.total_jobs_posted
                ? ` · ${customer.total_jobs_posted} ${customer.total_jobs_posted === 1 ? 'job' : 'jobs'} posted`
                : ''}
            </p>

            {customer.introduction && (
              <p className="mt-3 text-sm leading-relaxed text-ink-70">{customer.introduction}</p>
            )}
          </div>
        </div>
      </Card>

      <Card title={t('providers.reviews')}>
        {reviews.length === 0 ? (
          <Empty title={t('providers.noReviewsYet')}
            sub={t('providers.reviewsAppearHereOnceProvidersHave')} />
        ) : (
          <ul className="space-y-4">
            {reviews.map((r) => (
              <li key={r.review_id} className="border-b border-line-soft pb-4 last:border-0 last:pb-0">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-semibold text-ink">
                    {r.review_title ?? r.reviewer_name ?? t('providers.review')}
                  </span>
                  {scoreOf(r) != null && (
                    <span className="shrink-0 text-sm font-semibold text-ink-70">★ {scoreOf(r)}</span>
                  )}
                </div>
                {r.review_text && (
                  <p className="mt-1 text-sm leading-relaxed text-ink-70">{r.review_text}</p>
                )}
                <p className="mt-1 text-xs text-ink-50">
                  {r.reviewer_name ? `${r.reviewer_name} · ` : ''}{date(r.review_date)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
