'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updatePassword } from '@/lib/web/auth'
import { BackLink, Button, Card, ErrorNote, Field, PageTitle, PasswordInput } from '@/components/web/ui'
import { useT } from '@/lib/i18n'

export default function ChangePasswordPage() {
  const t = useT()
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 6) return setError(t('profile.passwordMustBeAtLeastCharacters'))
    if (password !== confirm) return setError(t('profile.passwordsDoNotMatch'))

    setBusy(true)
    const res = await updatePassword(password)
    if (!res.success) { setError(res.error ?? t('profile.couldNotUpdateYourPassword')); setBusy(false); return }
    setDone(true)
    setBusy(false)
    setTimeout(() => router.push('/profile'), 1200)
  }

  return (
    <div className="space-y-5">
      <BackLink href="/profile">{t('profile.backToProfile')}</BackLink>
      <PageTitle title={t('profile.changePassword')} />

      <Card>
        <form onSubmit={onSubmit} className="space-y-4">
          {error && <ErrorNote>{error}</ErrorNote>}
          {done && (
            <p className="rounded-lg bg-accent-soft px-4 py-3 text-sm font-medium text-ink">
              {t('profile.passwordUpdated')}
            </p>
          )}
          <Field label={t('profile.newPassword')} required hint={t('profile.atLeastCharacters')}>
            <PasswordInput required autoComplete="new-password" minLength={6}
              value={password} onChange={setPassword} />
          </Field>
          <Field label={t('profile.confirmPassword')} required>
            <PasswordInput required autoComplete="new-password"
              value={confirm} onChange={setConfirm} />
          </Field>
          <Button type="submit" fullWidth loading={busy}>{t('profile.updatePassword')}</Button>
        </form>
      </Card>
    </div>
  )
}
