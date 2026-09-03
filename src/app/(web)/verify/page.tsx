'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'

import { resendOtp, verifyOtp } from '@/lib/web/auth'
import { useSession } from '@/lib/web/session'
import { Button, ErrorNote } from '@/components/web/ui'
import { useT } from '@/lib/i18n'

// Supabase is configured for 8-digit codes here — the mobile SignupVerification
// screens render numberOfDigits={8} against the same project.
const LENGTH = 8

/** Six-box OTP entry, mirroring the mobile CustomOTPInput. */
function OtpBoxes({
  value,
  onChange,
  disabled,
}: {
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}) {
  const t = useT()
  const ref = useRef<HTMLInputElement>(null)

  return (
    <div className="relative">
      <input
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, LENGTH))}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={LENGTH}
        disabled={disabled}
        className="absolute inset-0 z-10 h-full w-full cursor-default opacity-0"
        aria-label={t('auth.verificationCode')}
      />
      {/* Eight boxes need a tighter gap than six to stay on one line on a phone. */}
      <div className="flex justify-between gap-1.5 sm:gap-2">
        {Array.from({ length: LENGTH }).map((_, i) => (
          <span
            key={i}
            onClick={() => ref.current?.focus()}
            className={`flex h-12 min-w-0 flex-1 items-center justify-center rounded-lg border text-lg font-bold text-ink transition-colors sm:h-14 sm:rounded-xl sm:text-xl ${
              value.length === i ? 'border-brand ring-1 ring-brand' : 'border-line'
            }`}
          >
            {value[i] ?? ''}
          </span>
        ))}
      </div>
    </div>
  )
}

function VerifyForm() {
  const t = useT()
  const router = useRouter()
  const params = useSearchParams()
  const { refresh } = useSession()

  const email = params.get('email') ?? ''
  const type = params.get('type') === 'recovery' ? 'recovery' : 'signup'
  const role = params.get('role') === 'service_provider' ? 'service_provider' : 'customer'

  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  async function submit() {
    setBusy(true)
    setError(null)

    const res = await verifyOtp(email, code, type)
    if (!res.success) {
      setError(res.error ?? t('auth.invalidCode'))
      setBusy(false)
      return
    }

    if (type === 'recovery') {
      router.replace('/reset-password')
      return
    }

    // Signup verified → profile is now 'incomplete'; the shell sends the user
    // to the right create-profile screen.
    await refresh()
    router.replace(role === 'customer' ? '/create-profile' : '/provider/create-profile')
  }

  async function resend() {
    setError(null)
    const res = await resendOtp(email)
    if (!res.success) setError(res.error ?? t('auth.couldNotResendTheCode'))
    else setCooldown(45)
  }

  if (!email) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="text-center">
          <ErrorNote>{t('auth.noEmailToVerify')}</ErrorNote>
          <Link href="/role?next=signup" className="mt-4 inline-block text-sm font-semibold text-brand-deep">
            {t('auth.startAgain')}
          </Link>
        </div>
      </div>
    )
  }

  return (
    // Same accent as the sign-up screen this came from — the role is already
    // known here, it was just never applied.
    <div data-role={role} className="flex min-h-screen items-center justify-center px-4 py-8 sm:py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center">
          <Image src="/logo.png" alt={t('auth.helpershob')} width={72} height={66} priority className="h-auto" />
        </div>

        <h1 className="text-center text-2xl font-bold tracking-tight text-ink">{t('auth.checkYourEmail')}</h1>
        <p className="mt-1 text-center text-sm text-ink-70">
          {t('auth.weSentACodeTo', { count: LENGTH })}{' '}
          <span className="font-semibold text-ink">{email}</span>
        </p>

        <div className="mt-7 space-y-4 rounded-2xl border border-line bg-surface p-6 shadow-sm">
          {error && <ErrorNote>{error}</ErrorNote>}

          <OtpBoxes value={code} onChange={setCode} disabled={busy} />

          <Button
            size="lg"
            fullWidth
            loading={busy}
            disabled={code.length < LENGTH}
            onClick={submit}
          >
            {t('auth.verify')}
          </Button>

          <button
            onClick={resend}
            disabled={cooldown > 0}
            className="w-full text-center text-sm font-semibold text-brand-deep disabled:text-ink-50"
          >
            {cooldown > 0 ? `Resend code in ${cooldown}s` : t('auth.resendCode')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function VerifyPage() {
  return (
    <Suspense fallback={null}>
      <VerifyForm />
    </Suspense>
  )
}
