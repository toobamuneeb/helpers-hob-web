'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { api } from '@/lib/web/api'
import { Avatar, BackLink, Card, Empty, ErrorNote, PageTitle, Spinner } from '@/components/web/ui'

interface Provider {
  user_id?: string
  provider_id?: string
  name: string | null
  profile_image_url: string | null
  introduction: string | null
  average_rating: number | null
  total_reviews?: number | null
  skills?: { name: string }[] | null
}

const id = (p: Provider) => p.user_id ?? p.provider_id ?? ''

function ProvidersList() {
  const params = useSearchParams()
  const skillId = params.get('skill')
  const skillName = params.get('name')

  const [providers, setProviders] = useState<Provider[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      // by-skill when a category was picked, otherwise the recommended list.
      const endpoint = skillId
        ? `/providers/by-skill${api.qs({ skill_id: skillId, limit: 50 })}`
        : '/providers/recommended?limit=50'
      const res = await api.get<Provider[]>(endpoint)
      if (cancelled) return
      if (res.success) setProviders(Array.isArray(res.data) ? res.data : [])
      else setError(res.error ?? 'Could not load providers')
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [skillId])

  return (
    <div className="space-y-5">
      <BackLink href="/categories">Back to categories</BackLink>
      <PageTitle
        title={skillName ?? 'Providers'}
        sub={loading ? undefined : `${providers.length} available`}
      />

      {error && <ErrorNote>{error}</ErrorNote>}

      <Card>
        {loading ? <Spinner /> : providers.length === 0 ? (
          <Empty title="No providers here yet"
            sub="Try another category, or post a job and let providers come to you." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {providers.map((p) => (
              <Link key={id(p)} href={`/providers/${id(p)}`}
                className="flex gap-3 rounded-lg border border-line bg-surface p-4 transition-colors hover:border-accent-role">
                <Avatar src={p.profile_image_url} name={p.name} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-ink">{p.name ?? 'Provider'}</span>
                  {p.skills && p.skills.length > 0 && (
                    <span className="block truncate text-xs text-ink-50">
                      {p.skills.map((s) => s.name).join(' · ')}
                    </span>
                  )}
                  {p.introduction && (
                    <span className="mt-1 line-clamp-2 block text-xs text-ink-70">{p.introduction}</span>
                  )}
                  <span className="mt-1 block text-xs font-semibold text-accent-role">
                    {p.average_rating ? `${p.average_rating} ★` : 'New provider'}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

export default function ProvidersPage() {
  return <Suspense fallback={<Spinner />}><ProvidersList /></Suspense>
}
