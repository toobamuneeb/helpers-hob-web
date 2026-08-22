'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/web/api'
import { useSession } from '@/lib/web/session'
import { uploadImage } from '@/lib/web/storage'
import ImagePicker from '@/components/web/ImagePicker'
import { BackLink, Button, Card, ErrorNote, Field, INPUT_CLASS, PageTitle } from '@/components/web/ui'

export default function EditProfilePage() {
  const router = useRouter()
  const { profile, refresh, isProvider } = useSession()

  const [form, setForm] = useState({
    name: profile?.name ?? '',
    phone: profile?.phone ?? '',
    country: profile?.country ?? '',
    state: profile?.state ?? '',
    city: profile?.city ?? '',
    zip: profile?.zip ?? '',
    introduction: profile?.introduction ?? '',
    location_address: profile?.location_address ?? '',
  })
  const [photo, setPhoto] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const set = (k: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return
    setBusy(true)
    setError(null)

    let imageUrl: string | undefined
    if (photo) {
      const up = await uploadImage(photo, 'profiles', `${profile.user_id}_profile_${Date.now()}`)
      if (up.error) { setError(up.error); setBusy(false); return }
      imageUrl = up.url
    }

    // Goes through /api/profile/update, the same endpoint the mobile app uses,
    // so any server-side rules apply identically.
    const res = await api.post('/profile/update', {
      ...form,
      ...(imageUrl ? { profile_image_url: imageUrl } : {}),
    })

    if (!res.success) { setError(res.error ?? 'Could not save your profile'); setBusy(false); return }
    await refresh()
    router.push('/profile')
  }

  return (
    <div className="space-y-5">
      <BackLink href="/profile">Back to profile</BackLink>
      <PageTitle title="Edit profile" />

      <form onSubmit={onSubmit} className="space-y-5">
        {error && <ErrorNote>{error}</ErrorNote>}

        <Card title="Photo">
          <ImagePicker label="Profile picture" value={photo} onChange={setPhoto}
            hint="Leave empty to keep your current photo." />
        </Card>

        <Card title="Details">
          <div className="space-y-4">
            <Field label="Name"><input value={form.name} onChange={set('name')} className={INPUT_CLASS} /></Field>
            <Field label="Phone"><input value={form.phone} onChange={set('phone')} className={INPUT_CLASS} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="City"><input value={form.city} onChange={set('city')} className={INPUT_CLASS} /></Field>
              <Field label="Postal code"><input value={form.zip} onChange={set('zip')} className={INPUT_CLASS} /></Field>
              <Field label="State"><input value={form.state} onChange={set('state')} className={INPUT_CLASS} /></Field>
              <Field label="Country"><input value={form.country} onChange={set('country')} className={INPUT_CLASS} /></Field>
            </div>
            {isProvider && (
              <>
                <Field label="Introduction">
                  <textarea rows={4} value={form.introduction} onChange={set('introduction')} className={INPUT_CLASS} />
                </Field>
                <Field label="Work location">
                  <input value={form.location_address} onChange={set('location_address')} className={INPUT_CLASS} />
                </Field>
              </>
            )}
          </div>
        </Card>

        <Button type="submit" size="lg" fullWidth loading={busy}>Save changes</Button>
      </form>
    </div>
  )
}
