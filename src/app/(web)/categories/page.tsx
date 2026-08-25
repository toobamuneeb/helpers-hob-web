'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getBrowserSupabase } from '@/lib/supabase-browser'
import { Card, Empty, INPUT_CLASS, PageTitle, Spinner } from '@/components/web/ui'

interface Skill { id: string; name: string; icon: string | null; color: string | null }

export default function CategoriesPage() {
  const [skills, setSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const { data } = await getBrowserSupabase()
        .from('skills').select('id, name, icon, color').eq('is_active', true).order('name')
      if (!cancelled) { setSkills((data as Skill[] | null) ?? []); setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [])

  const shown = search.trim()
    ? skills.filter((s) => s.name.toLowerCase().includes(search.trim().toLowerCase()))
    : skills

  return (
    <div className="space-y-5">
      <PageTitle title="Categories" sub={`${skills.length} services available`} />
      <input value={search} onChange={(e) => setSearch(e.target.value)}
        placeholder="Search categories…" className={INPUT_CLASS} />

      <Card>
        {loading ? <Spinner /> : shown.length === 0 ? (
          <Empty title="Nothing matches that search." />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {shown.map((s) => (
              <Link key={s.id} href={`/providers?skill=${s.id}&name=${encodeURIComponent(s.name)}`}
                className="flex flex-col items-center gap-2 rounded-lg border border-line bg-surface p-4 text-center transition-colors hover:border-accent-role">
                {/* skills.icon is a URL, and the mobile Home tile draws it on the
                    category colour — same here. A user-managed storage URL, so a
                    plain <img> that falls back to the initial if it will not load. */}
                <span className="flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold"
                  style={{ backgroundColor: s.color ?? '#EEFFF2' }}>
                  {s.icon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.icon} alt="" width={24} height={24} className="object-contain"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                  ) : (
                    s.name.slice(0, 1).toUpperCase()
                  )}
                </span>
                <span className="text-sm font-semibold text-ink">{s.name}</span>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
