'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/web/api'
import {
  Avatar, BackLink, Button, Card, Empty, ErrorNote, Spinner, date,
} from '@/components/web/ui'
import type { DayOfWeek } from '@/types/availability'

interface Review {
  review_id: string
  rating: number | null
  review_text: string | null
  review_title: string | null
  reviewer_name: string | null
  created_at: string
}

interface ProviderProfile {
  user_id: string
  name: string | null
  profile_image_url: string | null
  introduction: string | null
  city: string | null
  country: string | null
  average_rating: number | null
  total_reviews: number | null
  skills?: { skill_id?: string; name?: string; skill_name?: string }[] | null
}

interface Slot { day_of_week: DayOfWeek; start_time: string; end_time: string }

const DAY_ORDER: DayOfWeek[] = [
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
]

export default function ProviderProfilePage({
  params,
}: { params: Promise<{ providerId: string }> }) {
  const { providerId } = use(params)
  const router = useRouter()

  const [provider, setProvider] = useState<ProviderProfile | null>(null)
  const [slots, setSlots] = useState<Slot[]>([])
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [p, a, r] = await Promise.all([
        api.get<ProviderProfile>(`/profiles/provider/${providerId}`),
        api.get<{ slots?: Slot[] } | Slot[]>(`/providers/availability/${providerId}`),
        api.get<Review[]>(`/reviews/${providerId}?role=service_provider&limit=10`),
      ])
      if (cancelled) return

      if (p.success && p.data) setProvider(p.data)
      else setError(p.error ?? 'Could not load this provider')

      if (a.success && a.data) {
        const raw = a.data as { slots?: Slot[] } | Slot[]
        setSlots(Array.isArray(raw) ? raw : (raw.slots ?? []))
      }
      if (r.success && Array.isArray(r.data)) setReviews(r.data)

      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [providerId])

  /** Opens (or reuses) the chat, exactly as the mobile "Hire now" entry does. */
  async function startChat() {
    if (!provider) return
    setStarting(true)
    const res = await api.post<{ chat_id?: string }>('/chat/create', {
      service_provider_id: provider.user_id,
    })
    if (res.success && res.data?.chat_id) router.push(`/chats/${res.data.chat_id}`)
    else setError(res.error ?? 'Could not start the chat')
    setStarting(false)
  }

  if (loading) return <Spinner />
  if (!provider) return <ErrorNote>{error ?? 'Provider not found'}</ErrorNote>

  const skillNames = (provider.skills ?? [])
    .map((s) => s.name ?? s.skill_name)
    .filter(Boolean) as string[]

  const byDay = DAY_ORDER.map((d) => ({ day: d, items: slots.filter((s) => s.day_of_week === d) }))
    .filter((g) => g.items.length > 0)

  return (
    <div className="space-y-5">
      <BackLink href="/providers">Back</BackLink>
      {error && <ErrorNote>{error}</ErrorNote>}

      <Card>
        <div className="flex flex-wrap items-start gap-4">
          <Avatar src={provider.profile_image_url} name={provider.name} size="lg" />
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold tracking-tight text-ink">
              {provider.name ?? 'Provider'}
            </h1>
            <p className="mt-0.5 text-sm text-ink-70">
              {provider.average_rating ? `${provider.average_rating} ★` : 'New provider'}
              {provider.total_reviews ? ` · ${provider.total_reviews} reviews` : ''}
              {provider.city ? ` · ${provider.city}` : ''}
            </p>
            {skillNames.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {skillNames.map((s) => (
                  <span key={s} className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-ink">
                    {s}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Link href={`/post-job?provider=${provider.user_id}`}>
              <Button fullWidth>Hire now</Button>
            </Link>
            <Button variant="outline" fullWidth onClick={startChat} loading={starting}>
              Chat Now
            </Button>
          </div>
        </div>

        {provider.introduction && (
          <p className="mt-4 border-t border-line-soft pt-4 text-sm leading-relaxed text-ink-70">
            {provider.introduction}
          </p>
        )}
      </Card>

      <Card title="Availability">
        {byDay.length === 0 ? (
          <Empty title="No availability set" sub="This provider has not published their hours yet." />
        ) : (
          <dl className="space-y-2 text-sm">
            {byDay.map((g) => (
              <div key={g.day} className="flex justify-between gap-4">
                <dt className="font-semibold capitalize text-ink">{g.day}</dt>
                <dd className="text-right text-ink-70">
                  {g.items.map((s) => `${s.start_time}–${s.end_time}`).join(', ')}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </Card>

      <Card title={`Reviews${reviews.length ? ` · ${reviews.length}` : ''}`}>
        {reviews.length === 0 ? (
          <Empty title="No reviews yet" />
        ) : (
          <ul className="space-y-4">
            {reviews.map((r) => (
              <li key={r.review_id} className="border-b border-line-soft pb-4 last:border-0 last:pb-0">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-ink">{r.reviewer_name ?? 'Customer'}</span>
                  <span className="text-sm font-semibold text-accent-role">
                    {r.rating ? `${r.rating} ★` : '—'}
                  </span>
                </div>
                {r.review_title && <p className="mt-1 text-sm font-medium text-ink">{r.review_title}</p>}
                {r.review_text && <p className="mt-0.5 text-sm text-ink-70">{r.review_text}</p>}
                <p className="mt-1 text-xs text-ink-50">{date(r.created_at)}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
