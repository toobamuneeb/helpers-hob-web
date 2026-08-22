'use client'

import { Suspense, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'

import { sendPasswordResetOtp } from '@/lib/web/auth'
import type { UserRole } from '@/lib/web/session'
import { Button, ErrorNote, Field, INPUT_CLASS } from '@/components/web/ui'

function ForgotForm() {
  const router = useRouter()
  const params = useSearchParams()
  const role = (params.get('role') === 'service_provider' ? 'service_provider' : 'customer') as UserRole

  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)

    const res = await sendPasswordResetOtp(email.trim(), role)
    if (!res.success) {
      setError(res.error ?? 'Could not send the reset code')
      setBusy(false)
      return
    }
    router.push(`/verify?email=${encodeURIComponent(email.trim())}&type=recovery&role=${role}`)
  }

  return (
    // The role is already chosen at this point, so the page carries its
    // accent — providers see blue from their very first screen.
    <div data-role={role} className="flex min-h-screen items-center justify-center px-4 py-8 sm:py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center">
          <Image src="/logo.png" alt="HelpersHob" width={72} height={66} priority className="h-auto" />
        </div>

        <h1 className="text-center text-2xl font-bold tracking-tight text-ink">Reset your password</h1>
        <p className="mt-1 text-center text-sm text-ink-70">
          We&apos;ll email you a code to set a new one.
        </p>

        <form onSubmit={onSubmit} className="mt-7 space-y-4 rounded-2xl border border-line bg-surface p-6 shadow-sm">
          {error && <ErrorNote>{error}</ErrorNote>}

          <Field label="Email" required>
            <input
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={INPUT_CLASS}
            />
          </Field>

          <Button type="submit" size="lg" fullWidth loading={busy}>Send code</Button>
        </form>

        <p className="mt-5 text-center text-sm">
          <Link href={`/login?role=${role}`} className="font-semibold text-brand-deep hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  )
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ForgotForm />
    </Suspense>
  )
}
