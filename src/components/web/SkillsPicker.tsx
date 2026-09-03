'use client'

// The skill chips a provider taps to say what work they take on. Both the
// create-profile screen and the edit screen render this: a provider picks up a
// new trade long after signing up, and until this existed the set they chose on
// their first day was the set they were stuck with.

import { useEffect, useState } from 'react'
import { getBrowserSupabase } from '@/lib/supabase-browser'
import { Spinner } from '@/components/web/ui'
import { useT } from '@/lib/i18n'

export interface Skill {
  id: string
  name: string
}

/** Reads the active skill catalogue once. Returns [] while loading. */
export function useSkillCatalogue() {
  const [skills, setSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const { data } = await getBrowserSupabase()
        .from('skills')
        .select('id, name')
        .eq('is_active', true)
        .order('name')
      if (cancelled) return
      setSkills((data as Skill[] | null) ?? [])
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  return { skills, loading }
}

/**
 * Replaces a provider's skills with `skillIds`.
 *
 * Delete-then-insert rather than a diff: the set is small, and RLS already
 * scopes both halves to the caller's own rows. Returns an error message, or
 * null when it worked.
 *
 * The delete is skipped when the insert would be empty so a failed insert can
 * never leave a provider with no skills at all — callers validate for at least
 * one first, and this is the second line of defence.
 */
export async function saveSkills(userId: string, skillIds: string[]): Promise<string | null> {
  if (skillIds.length === 0) return 'Pick at least one skill'

  const supabase = getBrowserSupabase()
  const { error: delError } = await supabase.from('user_skills').delete().eq('user_id', userId)
  if (delError) return delError.message

  const { error: insError } = await supabase
    .from('user_skills')
    .insert(skillIds.map((skill_id) => ({ user_id: userId, skill_id })))
  return insError ? insError.message : null
}

export default function SkillsPicker({
  skills,
  loading,
  selected,
  onChange,
}: {
  skills: Skill[]
  loading: boolean
  selected: string[]
  onChange: (ids: string[]) => void
}) {
  const t = useT()

  if (loading) return <Spinner label={t('ui.loadingSkills')} />

  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])

  return (
    <div className="flex flex-wrap gap-2">
      {skills.map((s) => {
        const on = selected.includes(s.id)
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => toggle(s.id)}
            aria-pressed={on}
            className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ring-1 ring-inset transition-colors ${
              on
                ? 'bg-accent-role text-accent-on ring-transparent'
                : 'bg-surface text-ink-70 ring-line hover:bg-accent-soft'
            }`}
          >
            {s.name}
          </button>
        )
      })}
    </div>
  )
}
