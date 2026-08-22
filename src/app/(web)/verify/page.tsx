'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'

import { resendOtp, verifyOtp } from '@/lib/web/auth'
import { useSession } from '@/lib/web/session'
import { Button, ErrorNote } from '@/components/web/ui'

const LENGTH = 6

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
        aria-label="Verification code"
      />
      <div className="flex justify-between gap-2">
        {Array.from({ length: LENGTH }).map((_, i) => (
          <span
            key={i}
            onClick={() => ref.current?.focus()}
            className={`flex h-14 flex-1 items-center justify-center rounded-xl border text-xl font-bold text-ink transition-colors ${
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
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  async function submit() {
    setBusy(true)
    setError(null)

    const res = await verifyOtp(email, code, type)
    if (!res.success) {
      setError(res.error ?? 'Invalid code')
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
    if (!res.success) setError(res.error ?? 'Could not resend the code')
    else setCooldown(45)
  }

  if (!email) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="text-center">
          <ErrorNote>No email to verify.</ErrorNote>
          <Link href="/role?next=signup" className="mt-4 inline-block text-sm font-semibold text-brand-deep">
            Start again
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8 sm:py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center">
          <Image src="/logo.png" alt="HelpersHob" width={72} height={66} priority className="h-auto" />
        </div>

        <h1 className="text-center text-2xl font-bold tracking-tight text-ink">Check your email</h1>
        <p className="mt-1 text-center text-sm text-ink-70">
          We sent a {LENGTH}-digit code to <span className="font-semibold text-ink">{email}</span>
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
            Verify
          </Button>

          <button
            onClick={resend}
            disabled={cooldown > 0}
            className="w-full text-center text-sm font-semibold text-brand-deep disabled:text-ink-50"
          >
            {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
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
