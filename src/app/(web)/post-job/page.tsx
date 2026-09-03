'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

import { api } from '@/lib/web/api'
import { getBrowserSupabase } from '@/lib/supabase-browser'
import { useSession } from '@/lib/web/session'
import { uploadImage } from '@/lib/web/storage'
import MultiImagePicker from '@/components/web/MultiImagePicker'
import LocationPicker, { type PickedLocation } from '@/components/web/LocationPicker'
import {
  BackLink, Button, Card, ErrorNote, Field, INPUT_CLASS, PageTitle, money,
} from '@/components/web/ui'
import { useT } from '@/lib/i18n'

interface Skill { id: string; name: string }

/** get_provider_profile has used both namings for the skill rows over time. */
interface ProviderSkill {
  skill_id?: string
  id?: string
  skill_name?: string
  name?: string
}

const RECURRENCE = [
  { id: 'daily', labelKey: 'jobs.daily', subKey: 'jobs.everyDay' },
  { id: 'weekly', labelKey: 'jobs.weekly', subKey: 'jobs.everyWeek' },
  { id: 'bi-weekly', labelKey: 'jobs.biWeekly', subKey: 'jobs.everyWeeks' },
  { id: 'monthly', labelKey: 'jobs.monthly', subKey: 'jobs.everyMonth' },
] as const

const HOURS = [1, 2, 3, 4, 5]

// Fee model from STRIPE_MIGRATION.md: one-time 10% each side, recurring 1%,
// plus a €15 monthly customer token in months with recurring activity.
const CUSTOMER_TOKEN = 15

function PostJobForm() {
  const t = useT()
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
  const [photos, setPhotos] = useState<File[]>([])
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
  // Local date, not toISOString() — that shifts to UTC and can hand back
  // yesterday for anyone west of Greenwich.
  const today = (() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()

  const feeRate = form.isRecurring ? 0.01 : 0.1
  const platformFee = serviceAmount * feeRate
  const token = form.isRecurring ? CUSTOMER_TOKEN : 0
  const total = serviceAmount + platformFee + token

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!form.skillId) return setError(t('jobs.pleaseChooseACategory'))
    if (!location) return setError(t('jobs.pleasePickAnAddressFromThe'))
    if (!form.date || !form.time) return setError(t('jobs.pleasePickADateAndTime'))
    // A job in the past cannot be worked. The mobile date picker refuses one
    // with minimumDate, and a `min` on the input below does the same here — but
    // that is only a hint the browser offers, so the real refusal is this one,
    // and it catches a past time on today's date too.
    const when = new Date(`${form.date}T${form.time}`)
    if (Number.isNaN(when.getTime())) return setError(t('jobs.thatDateAndTimeDoNot'))
    if (when.getTime() <= Date.now()) {
      return setError(t('jobs.pleasePickADateAndTime2'))
    }
    if (serviceAmount <= 0) return setError(t('jobs.pleaseEnterAnHourlyRate'))
    if (form.isRecurring && !form.recurrenceType) return setError(t('jobs.pleaseChooseHowOftenItRepeats'))
    if (!profile) return

    setBusy(true)
    try {
      // 'job-images', not 'jobs' — the bucket the mobile AddServiceDetail
      // uploads to. Uploaded in order so the first pick stays the cover photo,
      // which is what every card and the offer row show.
      const imageUrls: string[] = []
      for (const [i, photo] of photos.entries()) {
        const up = await uploadImage(photo, 'job-images', `${profile.user_id}_job_${Date.now()}_${i}`)
        if (up.error) { setError(up.error); setBusy(false); return }
        if (up.url) imageUrls.push(up.url)
      }

      // service_date carries the full moment; service_time is the clock time on
      // a fixed epoch day — the shape both columns use (timestamptz).
      // Already parsed and checked above.
      const service_date = when.toISOString()
      const service_time = new Date(`1970-01-01T${form.time}:00`).toISOString()

      // Hours are persisted, not just used for the price — the provider needs
      // to see how long the job is before accepting.
      const service_duration = `${form.serviceHours} ${form.serviceHours === 1 ? 'hour' : 'hours'}`

      const shared = {
        skill_id: form.skillId,
        service_description: form.description,
        // image_url keeps older readers working; the trigger mirrors the two.
        image_url: imageUrls[0],
        image_urls: imageUrls,
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
        // Cash exists only on the recurring path — see the Payment card.
        pay_through_platform: form.isRecurring ? form.payThroughPlatform : true,
        recurrence_type: form.isRecurring ? form.recurrenceType : undefined,
      }

      const res = isHire
        ? await api.post('/offers', {
            ...shared,
            provider_id: providerId,
            offer_title: form.jobTitle || undefined,
            chat_id: chatId ?? undefined,
          })
        : await api.post('/jobs/posts', {
            ...shared,
            job_title: form.jobTitle || undefined,
          })

      if (!res.success) { setError(res.error ?? t('jobs.couldNotCreateTheJob')); setBusy(false); return }

      // A sent offer is not a booking until the provider accepts, so it shows up
      // on My Sent Offers — Bookings deliberately excludes unanswered offers.
      router.replace(isHire ? '/offers' : '/job-posted')
    } catch {
      setError(t('jobs.somethingWentWrongPleaseTryAgain'))
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <BackLink href={isHire ? `/providers/${providerId}` : '/home'}>{t('jobs.back')}</BackLink>
      <PageTitle
        title={isHire ? t('jobs.sendAnOffer') : t('jobs.postAJob')}
        sub={isHire
          ? t('jobs.theProviderWillAcceptOrDecline')
          : t('jobs.providersNearYouWillSeeThis')}
      />

      <form onSubmit={onSubmit} className="space-y-5">
        {error && <ErrorNote>{error}</ErrorNote>}

        <Card title={t('jobs.whatDoYouNeed')}>
          <div className="space-y-4">
            <Field label={t('jobs.category')} required
              hint={skillsAreProviders ? t('jobs.theServicesThisProviderOffers') : undefined}>
              <select required value={form.skillId} onChange={(e) => set('skillId', e.target.value)} className={INPUT_CLASS}>
                <option value="">{t('jobs.chooseACategory')}</option>
                {skills.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>

            <Field label={t('jobs.title')} hint={t('jobs.aShortSummaryEGFix')}>
              <input value={form.jobTitle} onChange={(e) => set('jobTitle', e.target.value)} maxLength={60} className={INPUT_CLASS} />
            </Field>

            <Field label={t('jobs.description')} required>
              <textarea required rows={4} minLength={10} maxLength={1000}
                value={form.description} onChange={(e) => set('description', e.target.value)}
                placeholder={t('jobs.describeTheWorkSoProvidersCan')} className={INPUT_CLASS} />
            </Field>

            <MultiImagePicker label={t('jobs.photos')} value={photos} onChange={setPhotos}
              hint={t('jobs.photosOptionalHint')} />
          </div>
        </Card>

        <Card title={t('jobs.whereAndWhen')} allowOverflow>
          <div className="space-y-4">
            <LocationPicker value={location} onChange={setLocation} required />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('jobs.date')} required>
                <input type="date" required min={today} value={form.date}
                  onChange={(e) => set('date', e.target.value)} className={INPUT_CLASS} />
              </Field>
              <Field label={t('jobs.startTime')} required>
                <input type="time" required value={form.time} onChange={(e) => set('time', e.target.value)} className={INPUT_CLASS} />
              </Field>
            </div>

            <Field label={t('jobs.howManyHours')} required>
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

        <Card title={t('jobs.repeat')}>
          <label className="flex items-center gap-3">
            <input type="checkbox" checked={form.isRecurring}
              onChange={(e) => {
                const on = e.target.checked
                // Turning recurring off takes the cash option with it, so a
                // one-time job can never be submitted as a cash job.
                setForm((f) => ({
                  ...f,
                  isRecurring: on,
                  payThroughPlatform: on ? f.payThroughPlatform : true,
                }))
              }}
              className="h-4 w-4 accent-[var(--color-accent-role)]" />
            <span className="text-sm font-semibold text-ink">{t('jobs.thisIsARecurringJob')}</span>
          </label>

          {form.isRecurring && (
            <div className="mt-4 space-y-3">
              <div className="grid gap-2 xs:grid-cols-2">
                {RECURRENCE.map((r) => (
                  <button key={r.id} type="button" onClick={() => set('recurrenceType', r.id)}
                    className={`rounded-lg border p-3 text-left transition-colors ${
                      form.recurrenceType === r.id ? 'border-accent-role bg-accent-soft' : 'border-line hover:border-accent-role'}`}>
                    <span className="block text-sm font-semibold text-ink">{t(r.labelKey)}</span>
                    <span className="block text-xs text-ink-50">{t(r.subKey)}</span>
                  </button>
                ))}
              </div>
              <p className="rounded-lg bg-accent-soft px-3.5 py-2.5 text-xs text-ink-70">
                {t('jobs.theNextJobIsScheduledAutomatically')}
              </p>
            </div>
          )}
        </Card>

        {isHire && (
          <Card title={t('jobs.payment')}>
            <div className="space-y-2">
              {[
                { value: true, label: t('jobs.payThroughThePlatform'), sub: t('jobs.cardPaymentProtectedByHelpershob') },
                { value: false, label: t('jobs.payTheProviderInCash'), sub: t('jobs.settleDirectlyOnTheDay') },
              ].map((o) => (
                <button key={String(o.value)} type="button"
                  disabled={!form.isRecurring && !o.value}
                  onClick={() => set('payThroughPlatform', o.value)}
                  className={`w-full rounded-lg border p-3 text-left transition-colors disabled:opacity-50 ${
                    form.payThroughPlatform === o.value ? 'border-accent-role bg-accent-soft' : 'border-line'}`}>
                  <span className="block text-sm font-semibold text-ink">{o.label}</span>
                  <span className="block text-xs text-ink-50">{o.sub}</span>
                </button>
              ))}
              {/* The fee model only has a cash path for recurring work: a one-time
                  job is 10% each side through the platform, while recurring is
                  either 1% + the monthly token online, or the token alone with
                  the service settled in cash. */}
              {!form.isRecurring && (
                <p className="text-xs text-ink-50">
                  {t('jobs.oneTimeJobsArePaidThrough')}
                </p>
              )}
            </div>
          </Card>
        )}

        <Card title={t('jobs.price')}>
          <Field label={t('jobs.hourlyRate')} required>
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
                  <dt className="text-ink-70">{t('jobs.monthlySubscription')}</dt>
                  <dd className="font-medium tabular-nums">{money(token)}</dd>
                </div>
              )}
              <div className="flex justify-between border-t border-line-soft pt-2 text-base">
                <dt className="font-semibold text-ink">{t('jobs.total')}</dt>
                <dd className="font-bold tabular-nums text-accent-role">{money(total)}</dd>
              </div>
            </dl>
          )}
        </Card>

        <Button type="submit" size="lg" fullWidth loading={busy}>
          {isHire ? t('jobs.sendOffer') : t('jobs.postJob')}
        </Button>
      </form>
    </div>
  )
}

export default function PostJobPage() {
  return <Suspense fallback={null}><PostJobForm /></Suspense>
}
