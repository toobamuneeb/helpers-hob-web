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

export default function NewReviewPage({ params }: { params: Promise<{ offerId: string }> }) {
  const { offerId } = use(params)
  const router = useRouter()
  const { isProvider } = useSession()

  const [rating, setRating] = useState(0)
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (rating === 0) return setError('Please choose a rating')
    setBusy(true)
    setError(null)

    // Each side posts to its own endpoint: providers rate customers, customers
    // rate providers, and the two live in one job_reviews row.
    const res = isProvider
      ? await api.post('/reviews/provider-review', {
          offer_id: offerId, provider_rating: rating, provider_review_title: title, provider_review_text: text,
        })
      : await api.post('/reviews/customer', {
          offer_id: offerId, customer_rating: rating, customer_review_title: title, customer_review_text: text,
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
          <Field label="Rating" required><Stars value={rating} onChange={setRating} /></Field>
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
