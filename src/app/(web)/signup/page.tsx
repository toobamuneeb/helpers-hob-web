'use client'

import { Suspense, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'

import { signUp } from '@/lib/web/auth'
import type { UserRole } from '@/lib/web/session'
import { Button, ErrorNote, Field, INPUT_CLASS } from '@/components/web/ui'

function SignupForm() {
  const router = useRouter()
  const params = useSearchParams()
  const role = (params.get('role') === 'service_provider' ? 'service_provider' : 'customer') as UserRole

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }

    setBusy(true)
    const res = await signUp(email.trim(), password, role)
    if (!res.success) {
      setError(res.error ?? 'Signup failed')
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
          <Image src="/logo.png" alt="HelpersHob" width={72} height={66} priority className="h-auto" />
        </Link>

        <h1 className="text-center text-2xl font-bold tracking-tight text-ink">Create your account</h1>
        <p className="mt-1 text-center text-sm text-ink-70">
          As {role === 'service_provider' ? 'a service provider' : 'a customer'}
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

          <Field label="Password" required hint="At least 6 characters">
            <input
              type="password"
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={INPUT_CLASS}
            />
          </Field>

          <Field label="Confirm password" required>
            <input
              type="password"
              required
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={INPUT_CLASS}
            />
          </Field>

          <Button type="submit" size="lg" fullWidth loading={busy}>Create account</Button>

          <p className="text-center text-xs text-ink-50">
            By continuing you agree to our{' '}
            <Link href="/privacy-policy" className="underline">privacy policy</Link>.
          </p>
        </form>

        <p className="mt-5 text-center text-sm text-ink-70">
          Already have an account?{' '}
          <Link href={`/login?role=${role}`} className="font-semibold text-accent-role hover:underline">
            Sign in
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
