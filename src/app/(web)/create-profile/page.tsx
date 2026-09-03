'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'

import { getBrowserSupabase } from '@/lib/supabase-browser'
import { uploadImage } from '@/lib/web/storage'
import { useSession } from '@/lib/web/session'
import ImagePicker from '@/components/web/ImagePicker'
import { Button, ErrorNote, Field, INPUT_CLASS } from '@/components/web/ui'
import { useT } from '@/lib/i18n'

interface FormState {
  name: string
  email: string
  phone: string
  country: string
  state: string
  zip: string
}

/**
 * Customer profile creation — the same six fields and required photo as the
 * mobile screen. On success profile_status becomes 'verified', which is what
 * lets the customer straight into the app (providers go to 'pending' instead).
 */
export default function CreateProfilePage() {
  const t = useT()
  const router = useRouter()
  const { profile, refresh, signOut } = useSession()

  const [form, setForm] = useState<FormState>({
    name: '',
    email: profile?.email ?? '',
    phone: '',
    country: '',
    state: '',
    zip: '',
  })
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoError, setPhotoError] = useState<string | undefined>()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setPhotoError(undefined)

    // The mobile screen refuses to submit without a photo; same rule here.
    if (!photo) {
      setPhotoError('Please upload a profile picture')
      return
    }
    if (!profile) return

    setBusy(true)
    try {
      const uploaded = await uploadImage(
        photo,
        'profiles',
        `${profile.user_id}_profile_${Date.now()}`,
      )
      if (uploaded.error || !uploaded.url) {
        setError(uploaded.error ?? t('profile.imageUploadFailed'))
        setBusy(false)
        return
      }

      const { error: updateError } = await getBrowserSupabase()
        .from('profiles')
        .update({
          name: form.name,
          phone: form.phone,
          country: form.country,
          state: form.state,
          zip: form.zip,
          profile_image_url: uploaded.url,
          profile_status: 'verified',
        })
        .eq('user_id', profile.user_id)

      if (updateError) {
        setError(updateError.message)
        setBusy(false)
        return
      }

      await refresh()
      router.replace('/home')
    } catch {
      setError(t('profile.somethingWentWrongPleaseTryAgain'))
      setBusy(false)
    }
  }

  return (
    <div data-role="customer" className="flex min-h-screen items-start justify-center px-4 py-10">
      <div className="w-full max-w-lg">
        {/* The only way out of this screen. There is a session but no profile
            yet, so "back" can only mean ending the session — say so plainly
            rather than leaving someone stuck here. */}
        <button
          type="button"
          onClick={signOut}
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-50 transition-colors hover:text-ink"
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="1.8"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {t('profile.backToSignIn')}
        </button>

        <div className="mb-6 flex flex-col items-center">
          <Image src="/logo.png" alt={t('profile.helpershob')} width={72} height={66} priority className="h-auto" />
        </div>

        <h1 className="text-center text-2xl font-bold tracking-tight text-ink">
          {t('profile.createYourProfile')}
        </h1>
        <p className="mt-1 text-center text-sm text-ink-70">
          {t('profile.thisIsWhatProvidersSeeWhen')}
        </p>

        <form onSubmit={onSubmit} className="mt-7 space-y-4 rounded-xl border border-line bg-surface p-6 shadow-sm">
          {error && <ErrorNote>{error}</ErrorNote>}

          <div className="flex justify-center">
            <ImagePicker
              label={t('profile.profilePicture')}
              value={photo}
              onChange={setPhoto}
              error={photoError}
            />
          </div>

          <Field label={t('profile.name')} required>
            <input required value={form.name} onChange={set('name')} placeholder={t('profile.bensonRonald')} className={INPUT_CLASS} />
          </Field>

          <Field label={t('profile.email')} required>
            <input
              type="email"
              required
              value={form.email}
              onChange={set('email')}
              placeholder={t('profile.abcYahooCom')}
              className={INPUT_CLASS}
              readOnly
            />
          </Field>

          <Field label={t('profile.phone')} required>
            <input required value={form.phone} onChange={set('phone')} placeholder="123-456-7890" className={INPUT_CLASS} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('profile.country')} required>
              <input required value={form.country} onChange={set('country')} placeholder={t('profile.netherlands')} className={INPUT_CLASS} />
            </Field>
            <Field label={t('profile.state')} required>
              <input required value={form.state} onChange={set('state')} placeholder={t('profile.northHolland')} className={INPUT_CLASS} />
            </Field>
          </div>

          <Field label={t('profile.postalCode')} required>
            <input required value={form.zip} onChange={set('zip')} placeholder="98765" className={INPUT_CLASS} />
          </Field>

          <Button type="submit" size="lg" fullWidth loading={busy}>{t('profile.continue')}</Button>
        </form>
      </div>
    </div>
  )
}
