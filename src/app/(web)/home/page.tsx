'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

import { api } from '@/lib/web/api'
import { getBrowserSupabase } from '@/lib/supabase-browser'
import { useSession } from '@/lib/web/session'
import StatTile from '@/components/web/StatTile'
import { Avatar, Button, Card, Empty, ErrorNote, Spinner, money } from '@/components/web/ui'

interface Skill {
  id: string
  name: string
  icon: string | null
  color: string | null
}

interface Spend {
  total_paid?: number
  total_payments?: number
  currency?: string
}

interface OfferLite { offer_id: string; offer_status: string }

interface Provider {
  user_id?: string
  provider_id?: string
  name: string | null
  profile_image_url: string | null
  introduction: string | null
  average_rating: number | null
  total_reviews?: number | null
  skills?: { name: string }[] | null
  hourly_rate?: string | null
}

/** Customer home: search, skill shortcuts, recommended providers. */
export default function CustomerHomePage() {
  const { profile } = useSession()

  const [skills, setSkills] = useState<Skill[]>([])
  const [providers, setProviders] = useState<Provider[]>([])
  const [spend, setSpend] = useState<Spend | null>(null)
  const [bookings, setBookings] = useState<OfferLite[]>([])
  const [jobPosts, setJobPosts] = useState<number>(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [skillRes, providerRes, spendRes, bookingRes, jobRes] = await Promise.all([
          getBrowserSupabase()
            .from('skills')
            .select('id, name, icon, color')
            .eq('is_active', true)
            .order('name'),
          api.get<Provider[]>('/providers/recommended?limit=8'),
          api.get<Spend>('/payments/history'),
          api.get<OfferLite[]>('/offers?limit=100'),
          api.get<{ job_id: string }[]>('/jobs/posts?limit=100'),
        ])
        if (cancelled) return

        setSkills((skillRes.data as Skill[] | null) ?? [])
        if (providerRes.success) {
          const list = providerRes.data
          setProviders(Array.isArray(list) ? list : [])
        } else {
          setError(providerRes.error ?? null)
        }

        if (spendRes.success && spendRes.data) setSpend(spendRes.data)
        if (bookingRes.success && Array.isArray(bookingRes.data)) setBookings(bookingRes.data)
        if (jobRes.success && Array.isArray(jobRes.data)) setJobPosts(jobRes.data.length)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const shown = skills

  const at = (...statuses: string[]) =>
    bookings.filter((b) => statuses.includes(b.offer_status)).length
  // "In progress" = started but not finished; scheduled work has not begun.
  const inProgress = at('active', 'awaiting_confirmation')
  const completed = at('completed')

  if (loading) return <Spinner />

  return (
    <div className="space-y-6">
      {/* Hero: greeting, search and the one action most people came for. */}
      <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-accent-soft via-canvas to-warm p-6 sm:p-8">
        <p className="text-sm font-medium text-ink-70">Welcome back</p>
        <h1 className="mt-0.5 text-[1.75rem] font-bold leading-tight tracking-[-0.02em] text-ink">
          {profile?.name ?? 'there'}
        </h1>
        <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ink-70">
          Find a verified professional near you, or post a job and let them come to you.
        </p>

        <div className="mt-5 flex flex-wrap gap-2.5">
          <Link href="/post-job"><Button size="md">Post a job</Button></Link>
          <Link href="/categories"><Button size="md" variant="outline">Browse categories</Button></Link>
        </div>
      </section>

      {/* Summary: what the customer has spent and what is moving. */}
      <div className="grid gap-3 xs:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        <StatTile
          label="Total Spent" icon="wallet" tone="accent" href="/bookings"
          value={money(spend?.total_paid ?? 0, spend?.currency ?? 'EUR')}
          sub={`${spend?.total_payments ?? 0} payments`}
        />
        <StatTile
          label="In Progress" icon="clock" tone="blue" href="/bookings"
          value={inProgress}
          sub="Active or awaiting confirmation"
        />
        <StatTile
          label="Completed" icon="check" tone="neutral" href="/bookings"
          value={completed}
          sub="Jobs finished"
        />
        <StatTile
          label="My Jobs" icon="briefcase" tone="warm" href="/my-jobs"
          value={jobPosts}
          sub="Job posts you created"
        />
      </div>

      <Card
        title="Categories"
        action={
          <Link href="/categories" className="text-sm font-semibold text-accent-role hover:underline">
            See all
          </Link>
        }
      >
        {shown.length === 0 ? (
          <Empty title="No categories match that search." />
        ) : (
          <div className="grid grid-cols-2 gap-3 xs:grid-cols-3 sm:grid-cols-4 md:grid-cols-6">
            {shown.slice(0, 12).map((s) => (
              <Link
                key={s.id}
                href={`/providers?skill=${s.id}&name=${encodeURIComponent(s.name)}`}
                className="group flex flex-col items-center gap-2 rounded-lg border border-line bg-surface p-3 text-center transition-all hover:-translate-y-0.5 hover:border-accent-role hover:shadow-md"
              >
                <span
                  className="flex h-11 w-11 items-center justify-center rounded-full text-base font-bold"
                  style={{ backgroundColor: s.color ?? '#EEFFF2' }}
                >
                  {s.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="text-xs font-semibold text-ink">{s.name}</span>
              </Link>
            ))}
          </div>
        )}
      </Card>

      {error && <ErrorNote>{error}</ErrorNote>}

      <Card
        title="Recommended for you"
        action={
          <Link href="/providers" className="text-sm font-semibold text-accent-role hover:underline">
            See all
          </Link>
        }
      >
        {providers.length === 0 ? (
          <Empty
            title="No providers yet"
            sub="Once providers join in your area they will show up here."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {providers.map((p) => {
              const id = p.user_id ?? p.provider_id ?? ''
              return (
                <Link
                  key={id}
                  href={`/providers/${id}`}
                  className="flex gap-3 rounded-lg border border-line bg-surface p-4 transition-all hover:-translate-y-0.5 hover:border-accent-role hover:shadow-md"
                >
                  <Avatar src={p.profile_image_url} name={p.name} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-ink">
                      {p.name ?? 'Provider'}
                    </span>
                    {p.skills && p.skills.length > 0 && (
                      <span className="block truncate text-xs text-ink-50">
                        {p.skills.map((s) => s.name).join(' · ')}
                      </span>
                    )}
                    <span className="mt-1 flex items-center gap-2 text-xs text-ink-70">
                      {p.average_rating ? <span>{p.average_rating} ★</span> : <span>New</span>}
                      {p.hourly_rate && <span>· {money(p.hourly_rate)}/hr</span>}
                    </span>
                  </span>
                </Link>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}
