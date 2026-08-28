'use client'

import { useRouter } from 'next/navigation'

import { useSession } from '@/lib/web/session'

/**
 * Back out of a page anyone can read.
 *
 * These are reached from several places — the sign-up form, the sign-in form,
 * the profile menu — so the only correct answer is wherever the reader actually
 * came from. A fixed link to the landing page sent someone half-way through
 * signing up to a screen written for visitors, where "Get Started" then dropped
 * them into the app.
 *
 * The fallback covers a direct visit, where there is no history to go back to.
 */
export default function PolicyBackLink() {
  const router = useRouter()
  const { profile } = useSession()

  function goBack() {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
      return
    }
    router.push(profile ? '/profile' : '/')
  }

  return (
    <button
      type="button"
      onClick={goBack}
      className="text-sm font-semibold text-ink-50 transition-colors hover:text-ink"
    >
      ← Back
    </button>
  )
}
