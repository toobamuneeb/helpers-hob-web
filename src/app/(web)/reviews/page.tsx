'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/web/api'
import { useSession } from '@/lib/web/session'
import { Card, Empty, ErrorNote, PageTitle, Spinner, date } from '@/components/web/ui'
import { useT } from '@/lib/i18n'

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

export default function MyReviewsPage() {
  const { profile, isProvider } = useSession()
  const t = useT()
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!profile) return
    let cancelled = false
    void (async () => {
      const role = isProvider ? 'service_provider' : 'customer'
      const res = await api.get<Review[]>(`/reviews/${profile.user_id}?role=${role}&limit=50`)
      if (cancelled) return
      if (res.success) setReviews(Array.isArray(res.data) ? res.data : [])
      else setError(res.error ?? t('reviews.couldNotLoadYourReviews'))
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [profile, isProvider])

  const avg = reviews.length
    ? (reviews.reduce((a, r) => a + (scoreOf(r) ?? 0), 0) / reviews.length).toFixed(2)
    : null

  return (
    <div className="space-y-5">
      <PageTitle title={t('reviews.myReviews')}
        sub={avg ? `${avg} ★ from ${reviews.length} reviews` : t('reviews.whatPeopleSaidAboutYou')} />
      {error && <ErrorNote>{error}</ErrorNote>}

      <Card>
        {loading ? <Spinner /> : reviews.length === 0 ? (
          <Empty title={t('reviews.noReviewsYet')} sub={t('reviews.reviewsAppearHereOnceAJob')} />
        ) : (
          <ul className="space-y-4">
            {reviews.map((r) => (
              <li key={r.review_id} className="border-b border-line-soft pb-4 last:border-0 last:pb-0">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-ink">{r.reviewer_name ?? t('reviews.anonymous')}</span>
                  <span className="font-semibold text-accent-role">{scoreOf(r) ? `${scoreOf(r)} ★` : '—'}</span>
                </div>
                {r.review_title && <p className="mt-1 text-sm font-medium text-ink">{r.review_title}</p>}
                {r.review_text && <p className="mt-0.5 text-sm text-ink-70">{r.review_text}</p>}
                <p className="mt-1 text-xs text-ink-50">{date(r.review_date)}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
