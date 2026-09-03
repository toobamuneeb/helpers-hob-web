'use client'

import { use, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/web/api'
import { useSession } from '@/lib/web/session'
import { BackLink, Button, Card, ErrorNote, Field, INPUT_CLASS, PageTitle } from '@/components/web/ui'
import { useT } from '@/lib/i18n'

function Stars({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" onClick={() => onChange(n)}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          className={`text-3xl leading-none transition-colors ${n <= value ? 'text-[#f5b301]' : 'text-line'}`}>
          ★
        </button>
      ))}
    </div>
  )
}

/** The parts the customer endpoint scores separately, in its own order. */
const DETAIL_RATINGS = [
  { key: 'skill', labelKey: 'reviews.qualityOfWork' },
  { key: 'communication', labelKey: 'reviews.communication' },
  { key: 'punctuality', labelKey: 'reviews.punctuality' },
  { key: 'professionalism', labelKey: 'reviews.professionalism' },
] as const

export default function NewReviewPage({ params }: { params: Promise<{ offerId: string }> }) {
  const { offerId } = use(params)
  const t = useT()
  const router = useRouter()
  const { isProvider } = useSession()

  const [rating, setRating] = useState(0)
  // /reviews/customer requires all four of these alongside the overall score;
  // /reviews/provider-review takes the overall one only. Sending just the
  // overall score was why every customer review came back rejected.
  const [detail, setDetail] = useState({
    skill: 0, communication: 0, punctuality: 0, professionalism: 0,
  })
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (rating === 0) return setError(t('reviews.pleaseChooseARating'))
    if (!isProvider && Object.values(detail).some((v) => v === 0)) {
      return setError(t('reviews.pleaseRateEachPartOfThe'))
    }
    setBusy(true)
    setError(null)

    // Each side posts to its own endpoint: providers rate customers, customers
    // rate providers, and the two live in one job_reviews row. Both endpoints
    // name the text fields review_title / review_text.
    const res = isProvider
      ? await api.post('/reviews/provider-review', {
          offer_id: offerId,
          provider_rating: rating,
          review_title: title || undefined,
          review_text: text || undefined,
        })
      : await api.post('/reviews/customer', {
          offer_id: offerId,
          customer_rating: rating,
          skill_rating: detail.skill,
          communication_rating: detail.communication,
          punctuality_rating: detail.punctuality,
          professionalism_rating: detail.professionalism,
          review_title: title || undefined,
          review_text: text || undefined,
        })

    if (!res.success) { setError(res.error ?? t('reviews.couldNotSubmitYourReview')); setBusy(false); return }
    router.replace(`/jobs/${offerId}`)
  }

  return (
    <div className="space-y-5">
      <BackLink href={`/jobs/${offerId}`}>{t('reviews.backToBooking')}</BackLink>
      <PageTitle title={t('reviews.leaveAReview')}
        sub={isProvider ? t('reviews.howWasWorkingWithThisCustomer') : t('reviews.howDidTheProviderDo')} />

      <Card>
        <form onSubmit={onSubmit} className="space-y-4">
          {error && <ErrorNote>{error}</ErrorNote>}
          <Field label={isProvider ? t('reviews.rating') : t('reviews.overallRating')} required>
            <Stars value={rating} onChange={setRating} />
          </Field>

          {!isProvider && DETAIL_RATINGS.map((d) => (
            <Field key={d.key} label={t(d.labelKey)} required>
              <Stars
                value={detail[d.key]}
                onChange={(v) => setDetail((prev) => ({ ...prev, [d.key]: v }))}
              />
            </Field>
          ))}
          <Field label={t('reviews.title')}>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200}
              placeholder={t('reviews.summariseYourExperience')} className={INPUT_CLASS} />
          </Field>
          <Field label={t('reviews.review')}>
            <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)}
              placeholder={t('reviews.shareDetailsAboutYourExperience')} className={INPUT_CLASS} />
          </Field>
          <Button type="submit" fullWidth loading={busy}>{t('reviews.submitReview')}</Button>
        </form>
      </Card>
    </div>
  )
}
