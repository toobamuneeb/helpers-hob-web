'use client'

import { Suspense, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'

import { signIn } from '@/lib/web/auth'
import { useSession } from '@/lib/web/session'
import type { UserRole } from '@/lib/web/session'
import { Button, ErrorNote, Field, INPUT_CLASS, PasswordInput } from '@/components/web/ui'

function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const { refresh } = useSession()

  const role = (params.get('role') === 'service_provider' ? 'service_provider' : 'customer') as UserRole
  const isProvider = role === 'service_provider'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)

    const res = await signIn(email.trim(), password, role)

    if (res.emailNotConfirmed) {
      router.push(`/verify?email=${encodeURIComponent(email.trim())}&type=signup&role=${role}`)
      return
    }
    if (!res.success) {
      setError(res.error ?? 'Login failed')
      setBusy(false)
      return
    }

    // The shell routes on profile_status once the profile lands.
    await refresh()
    router.replace(isProvider ? '/provider/home' : '/home')
  }

  return (
    // The role is already chosen at this point, so the page carries its
    // accent — providers see blue from their very first screen.
    <div data-role={role} className="flex min-h-screen items-center justify-center px-4 py-8 sm:py-12">
      <div className="w-full max-w-sm">
        <Link href="/role?next=login" className="mb-6 flex flex-col items-center">
          <Image src="/logo.png" alt="HelpersHob" width={72} height={66} priority className="h-auto" />
        </Link>

        <h1 className="text-center text-2xl font-bold tracking-tight text-ink">Welcome back</h1>
        <p className="mt-1 text-center text-sm text-ink-70">
          Signing in as {isProvider ? 'a service provider' : 'a customer'}
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

          <Field label="Password" required>
            <PasswordInput
              required
              value={password}
              onChange={setPassword}
            />
          </Field>

          <div className="text-right">
            <Link href={`/forgot-password?role=${role}`} className="text-sm font-semibold text-brand-deep hover:underline">
              Forgot password?
            </Link>
          </div>

          <Button type="submit" size="lg" fullWidth loading={busy}>Sign in</Button>
        </form>

        <p className="mt-5 text-center text-sm text-ink-70">
          Don&apos;t have an account?{' '}
          <Link href={`/signup?role=${role}`} className="font-semibold text-accent-role hover:underline">
            Sign up
          </Link>
        </p>
        <p className="mt-2 text-center text-sm">
          <Link href="/role?next=login" className="text-ink-50 hover:text-ink">Switch role</Link>
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}
