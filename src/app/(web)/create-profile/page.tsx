'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'

import { getBrowserSupabase } from '@/lib/supabase-browser'
import { uploadImage } from '@/lib/web/storage'
import { useSession } from '@/lib/web/session'
import ImagePicker from '@/components/web/ImagePicker'
import { Button, ErrorNote, Field, INPUT_CLASS } from '@/components/web/ui'

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
  const router = useRouter()
  const { profile, refresh } = useSession()

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
        setError(uploaded.error ?? 'Image upload failed')
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
      setError('Something went wrong. Please try again.')
      setBusy(false)
    }
  }

  return (
    <div data-role="customer" className="flex min-h-screen items-start justify-center px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="mb-6 flex flex-col items-center">
          <Image src="/logo.png" alt="HelpersHob" width={72} height={66} priority className="h-auto" />
        </div>

        <h1 className="text-center text-2xl font-bold tracking-tight text-ink">
          Create your profile
        </h1>
        <p className="mt-1 text-center text-sm text-ink-70">
          This is what providers see when you book them.
        </p>

        <form onSubmit={onSubmit} className="mt-7 space-y-4 rounded-xl border border-line bg-surface p-6 shadow-sm">
          {error && <ErrorNote>{error}</ErrorNote>}

          <div className="flex justify-center">
            <ImagePicker
              label="Profile picture"
              value={photo}
              onChange={setPhoto}
              error={photoError}
            />
          </div>

          <Field label="Name" required>
            <input required value={form.name} onChange={set('name')} placeholder="Benson Ronald" className={INPUT_CLASS} />
          </Field>

          <Field label="Email" required>
            <input
              type="email"
              required
              value={form.email}
              onChange={set('email')}
              placeholder="abc@yahoo.com"
              className={INPUT_CLASS}
              readOnly
            />
          </Field>

          <Field label="Phone" required>
            <input required value={form.phone} onChange={set('phone')} placeholder="123-456-7890" className={INPUT_CLASS} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Country" required>
              <input required value={form.country} onChange={set('country')} placeholder="Netherlands" className={INPUT_CLASS} />
            </Field>
            <Field label="State" required>
              <input required value={form.state} onChange={set('state')} placeholder="North Holland" className={INPUT_CLASS} />
            </Field>
          </div>

          <Field label="Postal code" required>
            <input required value={form.zip} onChange={set('zip')} placeholder="98765" className={INPUT_CLASS} />
          </Field>

          <Button type="submit" size="lg" fullWidth loading={busy}>Continue</Button>
        </form>
      </div>
    </div>
  )
}
