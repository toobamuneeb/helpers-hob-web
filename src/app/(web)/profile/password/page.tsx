'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updatePassword } from '@/lib/web/auth'
import { BackLink, Button, Card, ErrorNote, Field, INPUT_CLASS, PageTitle } from '@/components/web/ui'

export default function ChangePasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 6) return setError('Password must be at least 6 characters')
    if (password !== confirm) return setError('Passwords do not match')

    setBusy(true)
    const res = await updatePassword(password)
    if (!res.success) { setError(res.error ?? 'Could not update your password'); setBusy(false); return }
    setDone(true)
    setBusy(false)
    setTimeout(() => router.push('/profile'), 1200)
  }

  return (
    <div className="space-y-5">
      <BackLink href="/profile">Back to profile</BackLink>
      <PageTitle title="Change password" />

      <Card>
        <form onSubmit={onSubmit} className="space-y-4">
          {error && <ErrorNote>{error}</ErrorNote>}
          {done && (
            <p className="rounded-lg bg-accent-soft px-4 py-3 text-sm font-medium text-ink">
              Password updated.
            </p>
          )}
          <Field label="New password" required hint="At least 6 characters">
            <input type="password" required autoComplete="new-password"
              value={password} onChange={(e) => setPassword(e.target.value)} className={INPUT_CLASS} />
          </Field>
          <Field label="Confirm password" required>
            <input type="password" required autoComplete="new-password"
              value={confirm} onChange={(e) => setConfirm(e.target.value)} className={INPUT_CLASS} />
          </Field>
          <Button type="submit" fullWidth loading={busy}>Update password</Button>
        </form>
      </Card>
    </div>
  )
}
