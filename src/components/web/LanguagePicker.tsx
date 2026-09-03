'use client'

// The language choice, as two big side-by-side cards.
//
// Rendered on the sign-up screen (where it sets the account default) and in
// profile settings (where it changes it). Deliberately not a <select>: at
// sign-up this is the first thing a Dutch speaker sees, and it has to be
// obvious before they can read anything else on the page.

import { LOCALES, LOCALE_FLAGS, LOCALE_LABELS, type Locale } from '@/lib/i18n/config'

export default function LanguagePicker({
  value,
  onChange,
  className = '',
}: {
  value: Locale
  onChange: (next: Locale) => void
  className?: string
}) {
  return (
    <div className={`grid grid-cols-2 gap-3 ${className}`}>
      {LOCALES.map((code) => {
        const on = value === code
        return (
          <button
            key={code}
            type="button"
            onClick={() => onChange(code)}
            aria-pressed={on}
            lang={code}
            className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold ring-1 ring-inset transition-colors ${
              on
                ? 'bg-accent-role text-accent-on ring-transparent'
                : 'bg-surface text-ink-70 ring-line hover:bg-accent-soft'
            }`}
          >
            <span aria-hidden="true" className="text-base">{LOCALE_FLAGS[code]}</span>
            {LOCALE_LABELS[code]}
          </button>
        )
      })}
    </div>
  )
}
