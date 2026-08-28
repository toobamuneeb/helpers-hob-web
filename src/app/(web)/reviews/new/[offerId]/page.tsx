'use client'

import { use, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/web/api'
import { useSession } from '@/lib/web/session'
import { BackLink, Button, Card, ErrorNote, Field, INPUT_CLASS, PageTitle } from '@/components/web/ui'

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
  { key: 'skill', label: 'Quality of work' },
  { key: 'communication', label: 'Communication' },
  { key: 'punctuality', label: 'Punctuality' },
  { key: 'professionalism', label: 'Professionalism' },
] as const

export default function NewReviewPage({ params }: { params: Promise<{ offerId: string }> }) {
  const { offerId } = use(params)
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
    if (rating === 0) return setError('Please choose a rating')
    if (!isProvider && Object.values(detail).some((v) => v === 0)) {
      return setError('Please rate each part of the service')
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

    if (!res.success) { setError(res.error ?? 'Could not submit your review'); setBusy(false); return }
    router.replace(`/jobs/${offerId}`)
  }

  return (
    <div className="space-y-5">
      <BackLink href={`/jobs/${offerId}`}>Back to booking</BackLink>
      <PageTitle title="Leave a review"
        sub={isProvider ? 'How was working with this customer?' : 'How did the provider do?'} />

      <Card>
        <form onSubmit={onSubmit} className="space-y-4">
          {error && <ErrorNote>{error}</ErrorNote>}
          <Field label={isProvider ? 'Rating' : 'Overall rating'} required>
            <Stars value={rating} onChange={setRating} />
          </Field>

          {!isProvider && DETAIL_RATINGS.map((d) => (
            <Field key={d.key} label={d.label} required>
              <Stars
                value={detail[d.key]}
                onChange={(v) => setDetail((prev) => ({ ...prev, [d.key]: v }))}
              />
            </Field>
          ))}
          <Field label="Title">
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200}
              placeholder="Summarise your experience" className={INPUT_CLASS} />
          </Field>
          <Field label="Review">
            <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)}
              placeholder="Share details about your experience…" className={INPUT_CLASS} />
          </Field>
          <Button type="submit" fullWidth loading={busy}>Submit review</Button>
        </form>
      </Card>
    </div>
  )
}
