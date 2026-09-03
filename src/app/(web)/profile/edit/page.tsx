'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserSupabase } from '@/lib/supabase-browser'
import { api } from '@/lib/web/api'
import { useSession } from '@/lib/web/session'
import { uploadImage } from '@/lib/web/storage'
import AvailabilityPicker, { normaliseSlots, validateSlots, type Slot } from '@/components/web/AvailabilityPicker'
import ImagePicker from '@/components/web/ImagePicker'
import LocationPicker, { type PickedLocation } from '@/components/web/LocationPicker'
import LanguageCard from '@/components/web/LanguageCard'
import SkillsPicker, { saveSkills, useSkillCatalogue } from '@/components/web/SkillsPicker'
import { BackLink, Button, Card, ErrorNote, Field, INPUT_CLASS, PageTitle, Spinner } from '@/components/web/ui'
import { useT } from '@/lib/i18n'

export default function EditProfilePage() {
  const t = useT()
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
  // Providers set their work location the same way the create-profile screen
  // does — through the picker, which is what fills the coordinates. Typing an
  // address into a plain box left location_lat / location_lng pointing at
  // wherever the provider used to be, and the job feed's distance filter reads
  // exactly those two columns.
  const [location, setLocation] = useState<PickedLocation | null>(
    profile?.location_address && profile.location_lat != null && profile.location_lng != null
      ? {
          address: profile.location_address,
          lat: String(profile.location_lat),
          lng: String(profile.location_lng),
          city: profile.city ?? undefined,
          state: profile.state ?? undefined,
          postalCode: profile.zip ?? undefined,
          country: profile.country ?? undefined,
        }
      : null,
  )
  // Working hours live in their own table behind /providers/availability, so
  // they are fetched and saved separately from the profile row. The create
  // screen asks for them; leaving them out here meant a provider could never
  // change the hours they had set on the day they signed up.
  const [slots, setSlots] = useState<Slot[]>([])
  const [slotsLoaded, setSlotsLoaded] = useState(false)

  // A provider picks up new trades over time, so the skills chosen at sign-up
  // have to stay editable. The catalogue and the provider's own rows load
  // separately — the catalogue is public, the picks are RLS-scoped to them.
  const { skills, loading: loadingSkills } = useSkillCatalogue()
  const [selectedSkills, setSelectedSkills] = useState<string[]>([])
  const [skillsLoaded, setSkillsLoaded] = useState(false)

  useEffect(() => {
    if (!isProvider || !profile?.user_id) return
    let cancelled = false
    void (async () => {
      const { data } = await getBrowserSupabase()
        .from('user_skills')
        .select('skill_id')
        .eq('user_id', profile.user_id)
      if (cancelled) return
      setSelectedSkills(((data as { skill_id: string }[] | null) ?? []).map((r) => r.skill_id))
      setSkillsLoaded(true)
    })()
    return () => { cancelled = true }
  }, [isProvider, profile?.user_id])

  useEffect(() => {
    if (!isProvider || !profile?.user_id) return
    let cancelled = false
    void (async () => {
      const res = await api.get<{ slots?: Slot[] } | Slot[]>(
        `/providers/availability/${profile.user_id}`,
      )
      if (cancelled) return
      if (res.success && res.data) {
        const raw = res.data as { slots?: Slot[] } | Slot[]
        setSlots(normaliseSlots(Array.isArray(raw) ? raw : (raw.slots ?? [])))
      }
      setSlotsLoaded(true)
    })()
    return () => { cancelled = true }
  }, [isProvider, profile?.user_id])

  const [photo, setPhoto] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const set = (k: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return
    // The customer types these; a provider's come from the picked address.
    if (!isProvider) {
      for (const [label, value] of [
        ['country', form.country], ['state', form.state], ['postal code', form.zip],
      ] as const) {
        if (value.trim().length < 2) {
          setError(`Please fill in your ${label} — it needs at least 2 characters.`)
          return
        }
      }
    }

    if (isProvider && !location) {
      setError(t('profile.pleasePickYourWorkLocationFrom'))
      return
    }

    if (isProvider) {
      const slotProblem = validateSlots(slots)
      if (slotProblem) { setError(slotProblem); return }
    }

    // Same floor the create screen enforces: a provider with no skills matches
    // no job and would quietly vanish from every feed.
    if (isProvider && selectedSkills.length === 0) {
      setError(t('profile.pickAtLeastOneSkillIt'))
      return
    }

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
      // A provider's address parts come from the picked location, exactly as
      // the mobile EditProfile fills them — including its fallback. Nominatim
      // often returns no postcode, and /profile/update demands two characters
      // for country, state and zip, so mobile sends 'N/A' rather than leave the
      // save to fail on a field the provider was never asked for.
      ...(isProvider && location
        ? {
            location_address: location.address,
            location_lat: Number(location.lat),
            location_lng: Number(location.lng),
            city: location.city ?? form.city ?? null,
            country: location.country || form.country || 'N/A',
            state: location.state || form.state || 'N/A',
            zip: location.postalCode || form.zip || 'N/A',
          }
        : {}),
      ...(imageUrl ? { profile_image_url: imageUrl } : {}),
    })

    if (!res.success) { setError(res.error ?? t('profile.couldNotSaveYourProfile')); setBusy(false); return }

    if (isProvider) {
      const hours = await api.post('/providers/availability', {
        provider_id: profile.user_id,
        slots: normaliseSlots(slots),
      })
      if (!hours.success) {
        setError(hours.error ?? t('profile.yourDetailsWereSavedButThe'))
        setBusy(false)
        return
      }

      const skillProblem = await saveSkills(profile.user_id, selectedSkills)
      if (skillProblem) {
        setError(`Your details were saved, but the skills were not: ${skillProblem}`)
        setBusy(false)
        return
      }
    }

    await refresh()
    router.push('/profile')
  }

  return (
    <div className="space-y-5">
      <BackLink href="/profile">{t('profile.backToProfile')}</BackLink>
      <PageTitle title={t('profile.editProfile')} />

      <form onSubmit={onSubmit} className="space-y-5">
        {error && <ErrorNote>{error}</ErrorNote>}

        <Card title={t('profile.photo')}>
          <ImagePicker label={t('profile.profilePicture')} value={photo} onChange={setPhoto}
            hint={t('profile.leaveEmptyToKeepYourCurrent')} />
        </Card>

        <Card title={t('profile.details')} allowOverflow>
          <div className="space-y-4">
            <Field label={t('profile.name')}><input value={form.name} onChange={set('name')} className={INPUT_CLASS} /></Field>
            <Field label={t('profile.phone')}><input value={form.phone} onChange={set('phone')} className={INPUT_CLASS} /></Field>
            {/* A customer still types theirs: their create-profile screen asks
                for the parts, not an address. */}
            {!isProvider && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('profile.city')}><input value={form.city} onChange={set('city')} className={INPUT_CLASS} /></Field>
                <Field label={t('profile.postalCode')}><input value={form.zip} onChange={set('zip')} className={INPUT_CLASS} /></Field>
                <Field label={t('profile.state')}><input value={form.state} onChange={set('state')} className={INPUT_CLASS} /></Field>
                <Field label={t('profile.country')}><input value={form.country} onChange={set('country')} className={INPUT_CLASS} /></Field>
              </div>
            )}
            {isProvider && (
              <>
                <Field label={t('profile.introduction')}>
                  <textarea rows={4} value={form.introduction} onChange={set('introduction')} className={INPUT_CLASS} />
                </Field>
                <LocationPicker
                  value={location}
                  onChange={setLocation}
                  label={t('profile.workLocation')}
                  hint={t('profile.jobsAreMatchedToProvidersNear')}
                />
              </>
            )}
          </div>
        </Card>

        {profile && <LanguageCard userId={profile.user_id} />}

        {isProvider && (
          <Card title={t('profile.yourSkills')}>
            <p className="mb-3 text-sm text-ink-70">
              {t('profile.pickEverythingYouCanTakeOn')}
            </p>
            <SkillsPicker
              skills={skills}
              loading={loadingSkills || !skillsLoaded}
              selected={selectedSkills}
              onChange={setSelectedSkills}
            />
          </Card>
        )}

        {isProvider && (
          <Card title={t('profile.workingHours')}>
            <p className="mb-4 text-sm text-ink-70">
              {t('profile.customersCanOnlyBookYouInside')}
            </p>
            {slotsLoaded
              ? <AvailabilityPicker slots={slots} onChange={setSlots} />
              : <Spinner />}
          </Card>
        )}

        <Button type="submit" size="lg" fullWidth loading={busy}>{t('profile.saveChanges')}</Button>
      </form>
    </div>
  )
}
