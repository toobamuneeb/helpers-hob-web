'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'

import { getBrowserSupabase } from '@/lib/supabase-browser'
import { signIn } from '@/lib/web/auth'
import { useSession } from '@/lib/web/session'
import { Button, ErrorNote, Field, INPUT_CLASS, PasswordInput } from '@/components/web/ui'
import { useT } from '@/lib/i18n'
import { SUPPORT_EMAIL, SUPPORT_EMAIL_URL, SUPPORT_PHONE_DISPLAY, SUPPORT_WHATSAPP_URL } from '@/lib/contact'


export default function DeleteAccountPage() {
  const t = useT()
  const { profile, refresh, signOut } = useSession()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const signedIn = !!profile && !profile.is_deleted

  async function onSignIn(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const res = await signIn(email.trim(), password)
    if (!res.success) {
      setError(res.emailNotConfirmed ? t('accountDeletion.notConfirmed') : (res.error ?? t('auth.loginFailed')))
      setBusy(false)
      return
    }
    await refresh()
    setBusy(false)
  }

  async function onDelete() {
    if (!profile) return
    setBusy(true)
    setError(null)
    const supabase = getBrowserSupabase()

    // Uploaded files first: SQL cannot remove storage objects. Best effort.
    const byBucket: Record<string, string[]> = {}
    for (const url of [profile.profile_image_url, profile.id_card_front_url, profile.id_card_back_url]) {
      const m = url ? /\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/([^?]+)/.exec(url) : null
      if (m) (byBucket[m[1]] ??= []).push(decodeURIComponent(m[2]))
    }
    await Promise.all(
      Object.entries(byBucket).map(([bucket, paths]) =>
        supabase.storage.from(bucket).remove(paths).catch(() => undefined),
      ),
    )

    const { error: rpcError } = await supabase.rpc('delete_my_account')
    if (rpcError) {
      setError(
        rpcError.message?.includes('ACTIVE_BOOKINGS')
          ? t('accountDeletion.activeBookings')
          : t('accountDeletion.failed'),
      )
      setBusy(false)
      return
    }

    // The server already revoked every session; this clears the browser's.
    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined)
    await refresh().catch(() => undefined)
    setDone(true)
    setBusy(false)
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Link href="/" className="inline-flex items-center gap-2">
        <Image src="/logo.png" alt={t('status.helpershob')} width={40} height={37} priority className="h-auto" />
        <span className="text-base font-bold tracking-tight text-ink">{t('status.helpershob')}</span>
      </Link>

      <h1 className="mt-6 text-2xl font-bold tracking-tight text-ink">{t('accountDeletion.title')}</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-70">{t('accountDeletion.intro')}</p>

      {/* ── In the app ─────────────────────────────────────────────────── */}
      <section className="mt-6 rounded-2xl border border-line bg-surface p-5">
        <h2 className="text-base font-bold text-ink">{t('accountDeletion.inAppTitle')}</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-ink-70">
          <li>{t('accountDeletion.inAppStep1')}</li>
          <li>{t('accountDeletion.inAppStep2')}</li>
          <li>{t('accountDeletion.inAppStep3')}</li>
        </ol>
      </section>

      {/* ── On this page ───────────────────────────────────────────────── */}
      <section className="mt-4 rounded-2xl border border-line bg-surface p-5">
        <h2 className="text-base font-bold text-ink">{t('accountDeletion.webTitle')}</h2>

        {done ? (
          <p className="mt-3 rounded-xl bg-brand-soft px-4 py-3 text-sm font-medium text-brand-deep">
            {t('accountDeletion.done')}
          </p>
        ) : signedIn ? (
          <div className="mt-3 space-y-4">
            {error && <ErrorNote>{error}</ErrorNote>}
            <p className="text-sm text-ink-70">
              {t('accountDeletion.signedInAs')} <span className="font-semibold text-ink">{profile.email}</span>
            </p>
            <label className="flex items-start gap-2.5 text-sm text-ink-80">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[#e04848]"
              />
              {t('accountDeletion.confirmCheckbox')}
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="danger" size="lg" onClick={onDelete} disabled={!confirmed} loading={busy}>
                {t('accountDeletion.deleteButton')}
              </Button>
              <Button variant="ghost" size="lg" onClick={signOut} disabled={busy}>
                {t('status.signOut')}
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={onSignIn} className="mt-3 space-y-4">
            <p className="text-sm text-ink-70">{t('accountDeletion.signInFirst')}</p>
            {error && <ErrorNote>{error}</ErrorNote>}
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
            <Field label={t('auth.password')} required>
              <PasswordInput required value={password} onChange={setPassword} />
            </Field>
            <Button type="submit" variant="primary" size="lg" fullWidth loading={busy}>
              {t('auth.signIn')}
            </Button>
          </form>
        )}
      </section>

      {/* ── What happens to the data ───────────────────────────────────── */}
      <section className="mt-6 space-y-4 text-sm leading-relaxed text-ink-70">
        <div>
          <h2 className="text-base font-bold text-ink">{t('accountDeletion.deletedTitle')}</h2>
          <p className="mt-1">{t('accountDeletion.deletedBody')}</p>
        </div>
        <div>
          <h2 className="text-base font-bold text-ink">{t('accountDeletion.keptTitle')}</h2>
          <p className="mt-1">{t('accountDeletion.keptBody')}</p>
        </div>
        <div>
          <h2 className="text-base font-bold text-ink">{t('accountDeletion.helpTitle')}</h2>
          <p className="mt-1">
            {t('accountDeletion.helpBody')}{' '}
            <a href={SUPPORT_EMAIL_URL} className="font-semibold text-accent-role underline">{SUPPORT_EMAIL}</a>
            {' · '}
            <a href={SUPPORT_WHATSAPP_URL} className="font-semibold text-accent-role underline">
              WhatsApp {SUPPORT_PHONE_DISPLAY}
            </a>
          </p>
        </div>
      </section>
    </div>
  )
}
