'use client'

// Language row for the profile screen.
//
// Saves the moment it is tapped rather than waiting for the form's Save
// button: the UI switches language instantly, so leaving the row unsaved would
// mean the page reads Dutch while the account still says English, and the next
// load would silently flip it back.

import { useState } from 'react'
import { getBrowserSupabase } from '@/lib/supabase-browser'
import { useLocale, useT } from '@/lib/i18n'
import type { Locale } from '@/lib/i18n/config'
import { Card } from '@/components/web/ui'
import LanguagePicker from '@/components/web/LanguagePicker'

export default function LanguageCard({ userId }: { userId: string }) {
  const t = useT()
  const { locale, setLocale } = useLocale()
  const [error, setError] = useState<string | null>(null)

  async function choose(next: Locale) {
    const previous = locale
    setLocale(next)
    setError(null)

    const { error: saveError } = await getBrowserSupabase()
      .from('profiles')
      .update({ preferred_language: next })
      .eq('user_id', userId)

    // Roll the UI back rather than leave it showing a language the account did
    // not actually keep.
    if (saveError) {
      setLocale(previous)
      setError(saveError.message)
    }
  }

  return (
    <Card title={t('language.label')}>
      <LanguagePicker value={locale} onChange={choose} />
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
    </Card>
  )
}
