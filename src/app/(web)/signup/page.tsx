'use client'

import { Suspense, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'

import { signUp } from '@/lib/web/auth'
import type { UserRole } from '@/lib/web/session'
import { useLocale, useT } from '@/lib/i18n'
import LanguagePicker from '@/components/web/LanguagePicker'
import { Button, ErrorNote, Field, INPUT_CLASS, PasswordInput } from '@/components/web/ui'

function SignupForm() {
  const t = useT()
  // The picker drives the whole page immediately, so someone who chooses
  // Nederlands reads the rest of the form in Dutch before filling it in. The
  // same value is written to the profile as the account default.
  const { locale, setLocale } = useLocale()
  const router = useRouter()
  const params = useSearchParams()
  const role = (params.get('role') === 'service_provider' ? 'service_provider' : 'customer') as UserRole

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [agreed, setAgreed] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 6) {
      setError(t('auth.passwordTooShort'))
      return
    }
    if (password !== confirm) {
      setError(t('auth.passwordsDoNotMatch'))
      return
    }
    if (!agreed) {
      setError(t('auth.mustAgree'))
      return
    }

    setBusy(true)
    const res = await signUp(email.trim(), password, role, locale)
    if (!res.success) {
      setError(res.error ?? t('auth.signupFailed'))
      setBusy(false)
      return
    }

    router.push(`/verify?email=${encodeURIComponent(email.trim())}&type=signup&role=${role}`)
  }

  return (
    // The role is already chosen at this point, so the page carries its
    // accent — providers see blue from their very first screen.
    <div data-role={role} className="flex min-h-screen items-center justify-center px-4 py-8 sm:py-12">
      <div className="w-full max-w-sm">
        <Link href="/role?next=signup" className="mb-6 flex flex-col items-center">
          <Image src="/logo.png" alt={t('auth.helpershob')} width={72} height={66} priority className="h-auto" />
        </Link>

        <h1 className="text-center text-2xl font-bold tracking-tight text-ink">{t('auth.createYourAccount')}</h1>
        <p className="mt-1 text-center text-sm text-ink-70">
          {role === 'service_provider' ? t('auth.asProvider') : t('auth.asCustomer')}
        </p>

        <form onSubmit={onSubmit} className="mt-7 space-y-4 rounded-2xl border border-line bg-surface p-6 shadow-sm">
          {error && <ErrorNote>{error}</ErrorNote>}

          {/* First field on the form on purpose — everything below it is
              rendered in whatever is picked here. */}
          <Field label={t('language.title')} hint={t('language.hint')}>
            <LanguagePicker value={locale} onChange={setLocale} className="mt-1" />
          </Field>

          <Field label={t('auth.email')} required>
            <input
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={INPUT_CLASS}
            />
          </Field>

          <Field label={t('auth.password')} required hint={t('auth.passwordHint')}>
            <PasswordInput
              required
              autoComplete="new-password"
              minLength={6}
              value={password}
              onChange={setPassword}
            />
          </Field>

          <Field label={t('auth.confirmPassword')} required>
            <PasswordInput
              required
              autoComplete="new-password"
              value={confirm}
              onChange={setConfirm}
            />
          </Field>

          <Button type="submit" size="lg" fullWidth loading={busy} disabled={!agreed}>
            {t('auth.createAccount')}
          </Button>

          {/* The mobile Signup screen gates the button on this same checkbox,
              with the same wording. */}
          <label className="flex cursor-pointer items-start gap-2.5 text-left">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-brand"
            />
            <span className="text-xs leading-relaxed text-ink-70">
              {t('auth.agreeTerms')}{' '}
              <Link href="/privacy-policy" className="underline hover:text-ink">{t('auth.privacyPolicy')}</Link>.
            </span>
          </label>
        </form>

        <p className="mt-5 text-center text-sm text-ink-70">
          {t('auth.alreadyHaveAccount')}{' '}
          <Link href={`/login?role=${role}`} className="font-semibold text-accent-role hover:underline">
            {t('auth.signIn')}
          </Link>
        </p>
      </div>
    </div>
  )
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  )
}
