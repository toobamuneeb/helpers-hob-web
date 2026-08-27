'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getBrowserSupabase } from '@/lib/supabase-browser'
import { Card, Empty, INPUT_CLASS, PageTitle, SkillIcon, Spinner } from '@/components/web/ui'

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
                <SkillIcon icon={s.icon} color={s.color} name={s.name} size={48} />
                <span className="text-sm font-semibold text-ink">{s.name}</span>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
