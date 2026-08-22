'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'

import { getBrowserSupabase } from '@/lib/supabase-browser'
import { api } from '@/lib/web/api'
import { uploadImage } from '@/lib/web/storage'
import { useSession } from '@/lib/web/session'
import AvailabilityPicker, { validateSlots, type Slot } from '@/components/web/AvailabilityPicker'
import ImagePicker from '@/components/web/ImagePicker'
import LocationPicker, { type PickedLocation } from '@/components/web/LocationPicker'
import { Button, Card, ErrorNote, Field, INPUT_CLASS, Spinner } from '@/components/web/ui'

interface Skill {
  id: string
  name: string
}

/**
 * Provider profile creation — mirrors the mobile service createProfile screen.
 *
 * Ends at profile_status 'pending', NOT 'verified': providers submit ID
 * documents and wait for an admin. That is the difference from the customer
 * screen, and the reason the API then refuses their requests with
 * ACCOUNT_PENDING_APPROVAL until approved.
 */
export default function ProviderCreateProfilePage() {
  const router = useRouter()
  const { profile, refresh } = useSession()

  const [skills, setSkills] = useState<Skill[]>([])
  const [loadingSkills, setLoadingSkills] = useState(true)

  const [form, setForm] = useState({
    name: '',
    email: profile?.email ?? '',
    phone: '',
    introduction: '',
    locationAddress: '',
    country: '',
    state: '',
    city: '',
    zip: '',
    workRadiusKm: '15',
  })
  const [selectedSkills, setSelectedSkills] = useState<string[]>([])
  const [photo, setPhoto] = useState<File | null>(null)
  const [idFront, setIdFront] = useState<File | null>(null)
  const [idBack, setIdBack] = useState<File | null>(null)
  const [slots, setSlots] = useState<Slot[]>([])
  const [location, setLocation] = useState<PickedLocation | null>(null)

  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const { data } = await getBrowserSupabase()
        .from('skills')
        .select('id, name')
        .eq('is_active', true)
        .order('name')
      if (!cancelled) {
        setSkills((data as Skill[] | null) ?? [])
        setLoadingSkills(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const set = (k: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => setForm((f) => ({ ...f, [k]: e.target.value }))

  function toggleSkill(id: string) {
    setSelectedSkills((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    // Same order of checks as the mobile screen, so the first thing a provider
    // is told to fix is the same on both clients.
    if (selectedSkills.length === 0) return setError('At least one skill is required')
    if (!photo) return setError('Please upload a profile picture')
    if (!location) return setError('Please pick your work location from the suggestions')

    const slotProblem = validateSlots(slots)
    if (slotProblem) return setError(slotProblem)
    if (!profile) return

    setBusy(true)
    try {
      const uploadedPhoto = await uploadImage(
        photo,
        'profiles',
        `${profile.user_id}_profile_${Date.now()}`,
      )
      if (uploadedPhoto.error || !uploadedPhoto.url) {
        setError(uploadedPhoto.error ?? 'Image upload failed')
        setBusy(false)
        return
      }

      // ID documents are optional here, matching the mobile screen where those
      // two checks are commented out.
      let frontUrl: string | null = null
      let backUrl: string | null = null
      if (idFront) {
        const r = await uploadImage(idFront, 'documents', `${profile.user_id}_id_front_${Date.now()}`)
        if (r.error) { setError(r.error); setBusy(false); return }
        frontUrl = r.url ?? null
      }
      if (idBack) {
        const r = await uploadImage(idBack, 'documents', `${profile.user_id}_id_back_${Date.now()}`)
        if (r.error) { setError(r.error); setBusy(false); return }
        backUrl = r.url ?? null
      }

      const supabase = getBrowserSupabase()

      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          name: form.name,
          phone: form.phone,
          introduction: form.introduction,
          country: location.country ?? form.country,
          state: location.state ?? form.state,
          city: location.city ?? form.city,
          zip: location.postalCode ?? form.zip,
          profile_image_url: uploadedPhoto.url,
          id_card_front_url: frontUrl,
          id_card_back_url: backUrl,
          location_address: location.address,
          location_lat: Number(location.lat),
          location_lng: Number(location.lng),
          work_radius_km: Number(form.workRadiusKm) || 15,
          profile_status: 'pending',
        })
        .eq('user_id', profile.user_id)

      if (updateError) {
        setError(updateError.message)
        setBusy(false)
        return
      }

      // Replace rather than append, so re-running this screen cannot duplicate.
      await supabase.from('user_skills').delete().eq('user_id', profile.user_id)
      const { error: skillError } = await supabase
        .from('user_skills')
        .insert(selectedSkills.map((skill_id) => ({ user_id: profile.user_id, skill_id })))
      if (skillError) {
        setError(skillError.message)
        setBusy(false)
        return
      }

      const availability = await api.post('/providers/availability', {
        provider_id: profile.user_id,
        slots,
      })
      if (!availability.success) {
        setError(availability.error ?? 'Could not save your availability')
        setBusy(false)
        return
      }

      await refresh()
      router.replace('/pending-approval')
    } catch {
      setError('Something went wrong. Please try again.')
      setBusy(false)
    }
  }

  return (
    <div data-role="service_provider" className="min-h-screen px-4 py-10">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-6 flex flex-col items-center">
          <Image src="/logo.png" alt="HelpersHob" width={72} height={66} priority className="h-auto" />
        </div>

        <h1 className="text-center text-2xl font-bold tracking-tight text-ink">
          Set up your provider profile
        </h1>
        <p className="mt-1 text-center text-sm text-ink-70">
          Our team reviews every provider before their first job.
        </p>

        <form onSubmit={onSubmit} className="mt-7 space-y-6">
          {error && <ErrorNote>{error}</ErrorNote>}

          <Card title="About you">
            <div className="space-y-4">
              <div className="flex justify-center">
                <ImagePicker label="Profile picture" value={photo} onChange={setPhoto} />
              </div>

              <Field label="Name" required>
                <input required value={form.name} onChange={set('name')} placeholder="Benson Ronald" className={INPUT_CLASS} />
              </Field>

              <Field label="Email" required>
                <input type="email" required value={form.email} onChange={set('email')} className={INPUT_CLASS} readOnly />
              </Field>

              <Field label="Phone" required>
                <input required value={form.phone} onChange={set('phone')} placeholder="123-456-7890" className={INPUT_CLASS} />
              </Field>

              <Field label="Introduction" hint="Tell customers what you do and how long you have been doing it.">
                <textarea
                  value={form.introduction}
                  onChange={set('introduction')}
                  rows={4}
                  className={INPUT_CLASS}
                  placeholder="I have 8 years of experience in carpentry…"
                />
              </Field>
            </div>
          </Card>

          <Card title="Your skills">
            {loadingSkills ? (
              <Spinner label="Loading skills…" />
            ) : (
              <>
                <p className="mb-3 text-sm text-ink-70">Pick everything you can take on.</p>
                <div className="flex flex-wrap gap-2">
                  {skills.map((s) => {
                    const on = selectedSkills.includes(s.id)
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => toggleSkill(s.id)}
                        className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ring-1 ring-inset transition-colors ${
                          on
                            ? 'bg-accent-role text-accent-on ring-transparent'
                            : 'bg-surface text-ink-70 ring-line hover:bg-accent-soft'
                        }`}
                      >
                        {s.name}
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </Card>

          <Card title="Where you work">
            <div className="space-y-4">
              <LocationPicker value={location} onChange={setLocation}
                label="Work location" required
                hint="Jobs are matched to providers near the customer." />

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="City">
                  <input value={form.city} onChange={set('city')} className={INPUT_CLASS} />
                </Field>
                <Field label="Postal code">
                  <input value={form.zip} onChange={set('zip')} className={INPUT_CLASS} />
                </Field>
                <Field label="State">
                  <input value={form.state} onChange={set('state')} className={INPUT_CLASS} />
                </Field>
                <Field label="Country">
                  <input value={form.country} onChange={set('country')} className={INPUT_CLASS} />
                </Field>
              </div>

              <Field label="Travel distance" hint="How far you are willing to travel, in kilometres.">
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={form.workRadiusKm}
                  onChange={set('workRadiusKm')}
                  className={INPUT_CLASS}
                />
              </Field>
            </div>
          </Card>

          <Card title="ID documents">
            <p className="mb-4 text-sm text-ink-70">
              Used to verify your identity. Only our review team sees these.
            </p>
            <div className="grid gap-4 xs:grid-cols-2">
              <ImagePicker label="ID card — front" value={idFront} onChange={setIdFront} shape="card" />
              <ImagePicker label="ID card — back" value={idBack} onChange={setIdBack} shape="card" />
            </div>
          </Card>

          <Card title="Your availability">
            <p className="mb-4 text-sm text-ink-70">
              Customers can only book you inside these hours.
            </p>
            <AvailabilityPicker slots={slots} onChange={setSlots} />
          </Card>

          <Button type="submit" size="lg" fullWidth loading={busy}>
            Submit for review
          </Button>
        </form>
      </div>
    </div>
  )
}
