'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'

import { updatePassword } from '@/lib/web/auth'
import { useSession } from '@/lib/web/session'
import { Button, ErrorNote, Field, PasswordInput } from '@/components/web/ui'
import { useT } from '@/lib/i18n'

export default function ResetPasswordPage() {
  const t = useT()
  const router = useRouter()
  const { signOut } = useSession()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 6) {
      setError(t('auth.passwordMustBeAtLeastCharacters'))
      return
    }
    if (password !== confirm) {
      setError(t('auth.passwordsDoNotMatch'))
      return
    }

    setBusy(true)
    const res = await updatePassword(password)
    if (!res.success) {
      setError(res.error ?? t('auth.couldNotUpdateThePassword'))
      setBusy(false)
      return
    }

    // Sign out so the new password is actually used to get back in.
    await signOut()
    router.replace('/role?next=login')
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8 sm:py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center">
          <Image src="/logo.png" alt={t('auth.helpershob')} width={72} height={66} priority className="h-auto" />
        </div>

        <h1 className="text-center text-2xl font-bold tracking-tight text-ink">{t('auth.setANewPassword')}</h1>

        <form onSubmit={onSubmit} className="mt-7 space-y-4 rounded-2xl border border-line bg-surface p-6 shadow-sm">
          {error && <ErrorNote>{error}</ErrorNote>}

          <Field label={t('auth.newPassword')} required hint={t('auth.atLeastCharacters')}>
            <PasswordInput
              required
              autoComplete="new-password"
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

          <Button type="submit" size="lg" fullWidth loading={busy}>{t('auth.updatePassword')}</Button>
        </form>
      </div>
    </div>
  )
}
