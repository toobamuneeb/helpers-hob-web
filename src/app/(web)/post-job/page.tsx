'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

import { api } from '@/lib/web/api'
import { getBrowserSupabase } from '@/lib/supabase-browser'
import { useSession } from '@/lib/web/session'
import { uploadImage } from '@/lib/web/storage'
import ImagePicker from '@/components/web/ImagePicker'
import LocationPicker, { type PickedLocation } from '@/components/web/LocationPicker'
import {
  BackLink, Button, Card, ErrorNote, Field, INPUT_CLASS, PageTitle, money,
} from '@/components/web/ui'

interface Skill { id: string; name: string }

/** get_provider_profile has used both namings for the skill rows over time. */
interface ProviderSkill {
  skill_id?: string
  id?: string
  skill_name?: string
  name?: string
}

const RECURRENCE = [
  { id: 'daily', label: 'Daily', sub: 'Every day' },
  { id: 'weekly', label: 'Weekly', sub: 'Every week' },
  { id: 'bi-weekly', label: 'Bi-weekly', sub: 'Every 2 weeks' },
  { id: 'monthly', label: 'Monthly', sub: 'Every month' },
] as const

const HOURS = [1, 2, 3, 4, 5]

// Fee model from STRIPE_MIGRATION.md: one-time 10% each side, recurring 1%,
// plus a €15 monthly customer token in months with recurring activity.
const CUSTOMER_TOKEN = 15

function PostJobForm() {
  const router = useRouter()
  const params = useSearchParams()
  const { profile } = useSession()

  // With a provider id this is "Hire now"; without it, a public job post.
  const providerId = params.get('provider')
  const chatId = params.get('chat')
  const isHire = !!providerId

  const [skills, setSkills] = useState<Skill[]>([])
  const [form, setForm] = useState({
    jobTitle: '',
    skillId: '',
    description: '',
    date: '',
    time: '',
    serviceFee: '',
    serviceHours: 1,
    isRecurring: false,
    recurrenceType: '' as '' | (typeof RECURRENCE)[number]['id'],
    payThroughPlatform: true,
  })
  const [photo, setPhoto] = useState<File | null>(null)
  const [location, setLocation] = useState<PickedLocation | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Whether the category list is this provider's own, so the form can say so.
  const [skillsAreProviders, setSkillsAreProviders] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      // Hiring someone means picking from what that provider actually offers —
      // the mobile AddServiceDetail reads providerSkills off the profile and
      // only falls back to the full list when there are none.
      if (providerId) {
        const res = await api.get<{ skills?: ProviderSkill[] | null }>(
          `/profiles/provider/${providerId}`,
        )
        if (cancelled) return
        const mine = (res.success && Array.isArray(res.data?.skills) ? res.data.skills : [])
          .map((s) => ({ id: s.skill_id ?? s.id ?? '', name: s.skill_name ?? s.name ?? '' }))
          .filter((s) => s.id && s.name)
        if (mine.length > 0) {
          setSkills(mine)
          setSkillsAreProviders(true)
          return
        }
      }

      const { data } = await getBrowserSupabase()
        .from('skills').select('id, name').eq('is_active', true).order('name')
      if (!cancelled) {
        setSkills((data as Skill[] | null) ?? [])
        setSkillsAreProviders(false)
      }
    })()
    return () => { cancelled = true }
  }, [providerId])


  const rate = parseFloat(form.serviceFee) || 0
  const serviceAmount = rate * form.serviceHours
  const feeRate = form.isRecurring ? 0.01 : 0.1
  const platformFee = serviceAmount * feeRate
  const token = form.isRecurring ? CUSTOMER_TOKEN : 0
  const total = serviceAmount + platformFee + token

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!form.skillId) return setError('Please choose a category')
    // Required on the web even though the mobile screen lets it through — a job
    // with no picture is far harder for a provider to price.
    if (!photo) return setError('Please add a photo of the job')
    if (!location) return setError('Please pick an address from the suggestions')
    if (!form.date || !form.time) return setError('Please pick a date and time')
    if (serviceAmount <= 0) return setError('Please enter an hourly rate')
    if (form.isRecurring && !form.recurrenceType) return setError('Please choose how often it repeats')
    if (!profile) return

    setBusy(true)
    try {
      let imageUrl: string | undefined
      if (photo) {
        // 'job-images', not 'jobs' — the bucket the mobile AddServiceDetail uploads to.
        const up = await uploadImage(photo, 'job-images', `${profile.user_id}_job_${Date.now()}`)
        if (up.error) { setError(up.error); setBusy(false); return }
        imageUrl = up.url
      }

      // service_date carries the full moment; service_time is the clock time on
      // a fixed epoch day — the shape both columns use (timestamptz).
      const serviceDateTime = new Date(`${form.date}T${form.time}`)
      const service_date = serviceDateTime.toISOString()
      const service_time = new Date(`1970-01-01T${form.time}:00`).toISOString()

      // Hours are persisted, not just used for the price — the provider needs
      // to see how long the job is before accepting.
      const service_duration = `${form.serviceHours} ${form.serviceHours === 1 ? 'hour' : 'hours'}`

      const shared = {
        skill_id: form.skillId,
        service_description: form.description,
        image_url: imageUrl,
        location_address: location.address,
        // Coordinates drive the provider job feed's distance filter — without
        // them a job is invisible to nearby providers.
        location_lat: Number(location.lat),
        location_lng: Number(location.lng),
        service_duration,
        service_time,
        service_date,
        payment_amount: serviceAmount,
        currency: 'EUR',
        is_recurring: form.isRecurring,
        recurrence_type: form.isRecurring ? form.recurrenceType : undefined,
      }

      const res = isHire
        ? await api.post('/offers', {
            ...shared,
            provider_id: providerId,
            offer_title: form.jobTitle || undefined,
            chat_id: chatId ?? undefined,
            pay_through_platform: form.payThroughPlatform,
          })
        : await api.post('/jobs/posts', {
            ...shared,
            job_title: form.jobTitle || undefined,
          })

      if (!res.success) { setError(res.error ?? 'Could not create the job'); setBusy(false); return }

      // A sent offer is not a booking until the provider accepts, so it shows up
      // on My Sent Offers — Bookings deliberately excludes unanswered offers.
      router.replace(isHire ? '/offers' : '/job-posted')
    } catch {
      setError('Something went wrong. Please try again.')
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <BackLink href={isHire ? `/providers/${providerId}` : '/home'}>Back</BackLink>
      <PageTitle
        title={isHire ? 'Send an offer' : 'Post a job'}
        sub={isHire
          ? 'The provider will accept or decline this offer.'
          : 'Providers near you will see this and can make an offer.'}
      />

      <form onSubmit={onSubmit} className="space-y-5">
        {error && <ErrorNote>{error}</ErrorNote>}

        <Card title="What do you need?">
          <div className="space-y-4">
            <Field label="Category" required
              hint={skillsAreProviders ? 'The services this provider offers.' : undefined}>
              <select required value={form.skillId} onChange={(e) => set('skillId', e.target.value)} className={INPUT_CLASS}>
                <option value="">Choose a category</option>
                {skills.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>

            <Field label="Title" hint="A short summary, e.g. “Fix kitchen cabinet door”.">
              <input value={form.jobTitle} onChange={(e) => set('jobTitle', e.target.value)} maxLength={60} className={INPUT_CLASS} />
            </Field>

            <Field label="Description" required>
              <textarea required rows={4} minLength={10} maxLength={1000}
                value={form.description} onChange={(e) => set('description', e.target.value)}
                placeholder="Describe the work so providers can quote accurately…" className={INPUT_CLASS} />
            </Field>

            <ImagePicker label="Photo" required value={photo} onChange={setPhoto} shape="card"
              hint="A picture helps providers understand the job." />
          </div>
        </Card>

        <Card title="Where and when">
          <div className="space-y-4">
            <LocationPicker value={location} onChange={setLocation} required />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Date" required>
                <input type="date" required value={form.date} onChange={(e) => set('date', e.target.value)} className={INPUT_CLASS} />
              </Field>
              <Field label="Start time" required>
                <input type="time" required value={form.time} onChange={(e) => set('time', e.target.value)} className={INPUT_CLASS} />
              </Field>
            </div>

            <Field label="How many hours?" required>
              <div className="flex flex-wrap gap-2">
                {HOURS.map((h) => (
                  <button key={h} type="button" onClick={() => set('serviceHours', h)}
                    className={`h-12 w-12 rounded-lg text-sm font-semibold ring-1 ring-inset transition-colors sm:h-11 sm:w-11 ${
                      form.serviceHours === h
                        ? 'bg-accent-role text-accent-on ring-transparent'
                        : 'bg-surface text-ink-70 ring-line hover:bg-accent-soft'}`}>
                    {h}
                  </button>
                ))}
              </div>
            </Field>
          </div>
        </Card>

        <Card title="Repeat">
          <label className="flex items-center gap-3">
            <input type="checkbox" checked={form.isRecurring}
              onChange={(e) => {
                const on = e.target.checked
                // Recurring work always goes through the platform, same as the app.
                setForm((f) => ({
                  ...f,
                  isRecurring: on,
                  payThroughPlatform: on ? true : f.payThroughPlatform,
                }))
              }}
              className="h-4 w-4 accent-[var(--color-accent-role)]" />
            <span className="text-sm font-semibold text-ink">This is a recurring job</span>
          </label>

          {form.isRecurring && (
            <div className="mt-4 space-y-3">
              <div className="grid gap-2 xs:grid-cols-2">
                {RECURRENCE.map((r) => (
                  <button key={r.id} type="button" onClick={() => set('recurrenceType', r.id)}
                    className={`rounded-lg border p-3 text-left transition-colors ${
                      form.recurrenceType === r.id ? 'border-accent-role bg-accent-soft' : 'border-line hover:border-accent-role'}`}>
                    <span className="block text-sm font-semibold text-ink">{r.label}</span>
                    <span className="block text-xs text-ink-50">{r.sub}</span>
                  </button>
                ))}
              </div>
              <p className="rounded-lg bg-accent-soft px-3.5 py-2.5 text-xs text-ink-70">
                The next job is scheduled automatically after each one is completed.
                It continues until you or the provider request to cancel.
              </p>
            </div>
          )}
        </Card>

        {isHire && (
          <Card title="Payment">
            <div className="space-y-2">
              {[
                { value: true, label: 'Pay through the platform', sub: 'Card payment, protected by HelpersHob.' },
                { value: false, label: 'Pay the provider in cash', sub: 'Settle directly on the day.' },
              ].map((o) => (
                <button key={String(o.value)} type="button"
                  disabled={form.isRecurring && !o.value}
                  onClick={() => set('payThroughPlatform', o.value)}
                  className={`w-full rounded-lg border p-3 text-left transition-colors disabled:opacity-50 ${
                    form.payThroughPlatform === o.value ? 'border-accent-role bg-accent-soft' : 'border-line'}`}>
                  <span className="block text-sm font-semibold text-ink">{o.label}</span>
                  <span className="block text-xs text-ink-50">{o.sub}</span>
                </button>
              ))}
              {form.isRecurring && (
                <p className="text-xs text-ink-50">Recurring jobs are always paid through the platform.</p>
              )}
            </div>
          </Card>
        )}

        <Card title="Price">
          <Field label="Hourly rate (€)" required>
            <input type="number" min="1" step="0.01" required inputMode="decimal"
              value={form.serviceFee} onChange={(e) => set('serviceFee', e.target.value)}
              placeholder="25.00" className={INPUT_CLASS} />
          </Field>

          {serviceAmount > 0 && (
            <dl className="mt-4 space-y-2 border-t border-line-soft pt-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-70">{form.serviceHours} h × {money(rate)}</dt>
                <dd className="font-medium tabular-nums">{money(serviceAmount)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-70">Service fee ({form.isRecurring ? '1' : '10'}%)</dt>
                <dd className="font-medium tabular-nums">{money(platformFee)}</dd>
              </div>
              {token > 0 && (
                <div className="flex justify-between">
                  <dt className="text-ink-70">Monthly subscription</dt>
                  <dd className="font-medium tabular-nums">{money(token)}</dd>
                </div>
              )}
              <div className="flex justify-between border-t border-line-soft pt-2 text-base">
                <dt className="font-semibold text-ink">Total</dt>
                <dd className="font-bold tabular-nums text-accent-role">{money(total)}</dd>
              </div>
            </dl>
          )}
        </Card>

        <Button type="submit" size="lg" fullWidth loading={busy}>
          {isHire ? 'Send offer' : 'Post job'}
        </Button>
      </form>
    </div>
  )
}

export default function PostJobPage() {
  return <Suspense fallback={null}><PostJobForm /></Suspense>
}
