'use client'

import { Suspense, use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

import { api } from '@/lib/web/api'
import { getBrowserSupabase } from '@/lib/supabase-browser'
import { useSession } from '@/lib/web/session'
import MapView from '@/components/web/MapView'
import CancelRecurringDialog from '@/components/web/CancelRecurringDialog'
import { useJobActions, canStart, primaryAction } from '@/lib/web/useJobActions'
import {
  Avatar, BackLink, Badge, Button, Card, ErrorNote, Spinner, Thumb,
  date, money, time,
} from '@/components/web/ui'
import { useT } from '@/lib/i18n'
import JobPhotos from '@/components/web/JobPhotos'

/**
 * Shape the API actually returns.
 *
 * /api/offers/[offerId] spreads the row and then FLATTENS the joins into
 * customer_* / provider_* / skill_* — the nested objects it also carries only
 * select id, name and avatar, so the flat fields are the reliable ones.
 */
interface Offer {
  offer_id: string
  offer_title: string | null
  service_description: string
  offer_status: string
  offer_job_status: string | null
  service_date: string
  service_time: string
  service_duration: string | null
  location_address: string | null
  location_lat: number | string | null
  location_lng: number | string | null
  payment_amount: string
  currency: string | null
  pay_through_platform: boolean
  is_recurring: boolean
  recurrence_type: string | null
  occurrence_number: number | null
  parent_offer_id: string | null
  cancellation_reason: string | null
  image_url: string | null
  /** All photos, in order. image_url mirrors the first. */
  image_urls?: string[] | null
  chat_id: string | null
  payment_id: string | null
  payment_status: string | null

  skill_name: string | null
  skill_color: string | null
  customer_id: string
  customer_name: string | null
  customer_avatar: string | null
  provider_id: string
  provider_name: string | null
  provider_avatar: string | null
}

/**
 * Which screen the user came from.
 *
 * The mobile JobDetail takes the same thing as a `source` route param and
 * switches both its back target and its action row on it, because the one
 * screen is reached from Offers, Bookings, Jobs and the Calendar — and an
 * offer waiting for a reply is not the same thing as a booking in progress.
 */
type Source = 'offers' | 'bookings' | 'jobs' | 'calendar'

const SOURCES: Source[] = ['offers', 'bookings', 'jobs', 'calendar']

function JobDetail({ offerId }: { offerId: string }) {
  const t = useT()
  const search = useSearchParams()
  const raw = search.get('from')
  const from = SOURCES.includes(raw as Source) ? (raw as Source) : null
  // The list's open tab, so returning puts you back where you were rather than
  // on the list's first tab.
  const tab = search.get('tab')
  const withTab = (href: string) => (tab ? `${href}?tab=${encodeURIComponent(tab)}` : href)

  const { profile, isProvider } = useSession()

  // The job's own payment and the month's subscription are two different
  // transactions, and a recurring job can have both. Kept apart so each gets
  // its own receipt.
  const [jobPaymentId, setJobPaymentId] = useState<string | null>(null)
  const [tokenPaymentId, setTokenPaymentId] = useState<string | null>(null)

  // Which side has already left a review on this job.
  const [reviewed, setReviewed] = useState({ customer: false, provider: false })

  const [offer, setOffer] = useState<Offer | null>(null)
  const [loading, setLoading] = useState(true)
  const [localError, setLocalError] = useState<string | null>(null)
  const [cancelOpen, setCancelOpen] = useState(false)

  const load = useCallback(async () => {
  const t = useT()
    const res = await api.get<Offer>(`/offers/${offerId}`)
    if (res.success && res.data) { setOffer(res.data); setLocalError(null) }
    else setLocalError(res.error ?? t('jobs.couldNotLoadThisBooking'))
    setLoading(false)
  }, [offerId])

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(() => { if (!cancelled) void load() }, 0)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [load])

  /**
   * Every paid transaction filed against this job, sorted into the two things
   * one can be.
   *
   * job_offers.payment_id only ever points at a service payment the platform
   * handled — a cash job has none, and the monthly subscription never appears
   * there at all. The payments rows are the whole picture, and the two kinds
   * are kept apart so the work and the fee each keep their own slip.
   */
  useEffect(() => {
    if (!offer || !profile) return
    let cancelled = false
    void (async () => {
      const { data } = await getBrowserSupabase()
        .from('payments')
        .select('payment_id, payment_kind, payer_id, payee_id')
        .eq('offer_id', offer.offer_id)
        .eq('payment_status', 'paid')
      if (cancelled || !data) return

      const rows = data as unknown as PaymentRow[]

      // Only the two sides of a transaction get to see its receipt.
      const mine = rows.filter(
        (r) => r.payer_id === profile.user_id || r.payee_id === profile.user_id,
      )
      const isTokenRow = (k: string | null) =>
        k === 'provider_token' || k === 'customer_token'

      setTokenPaymentId(mine.find((r) => isTokenRow(r.payment_kind))?.payment_id ?? null)
      setJobPaymentId(mine.find((r) => !isTokenRow(r.payment_kind))?.payment_id ?? null)
    })()
    return () => { cancelled = true }
  }, [offer, profile])

  // One row per offer, holding both sides' reviews — a date is set when that
  // side has written one.
  useEffect(() => {
    if (!offer || offer.offer_status !== 'completed') return
    let cancelled = false
    void (async () => {
      const { data } = await getBrowserSupabase()
        .from('job_reviews')
        .select('customer_review_date, provider_review_date')
        .eq('offer_id', offer.offer_id)
        .maybeSingle()
      if (cancelled || !data) return
      setReviewed({
        customer: Boolean(data.customer_review_date),
        provider: Boolean(data.provider_review_date),
      })
    })()
    return () => { cancelled = true }
  }, [offer])

  // Every lifecycle action, with the gates the mobile app puts before them.
  const jobs = useJobActions(load)
  const busy = jobs.busyId !== null
  const error = localError ?? jobs.error

  async function act(action: string, extra?: Record<string, unknown>) {
    await jobs.post(offerId, action, extra)
  }

  if (loading) return <Spinner />
  if (!offer) return <ErrorNote>{error ?? t('jobs.bookingNotFound')}</ErrorNote>

  const status = offer.offer_status
  const currency = offer.currency ?? 'EUR'

  const otherName = isProvider ? offer.customer_name : offer.provider_name
  const otherAvatar = isProvider ? offer.customer_avatar : offer.provider_avatar
  const otherId = isProvider ? offer.customer_id : offer.provider_id

  // Go back where you actually came from. Sidebar wording, so the link names
  // the screen the user will land on.
  const back =
    from === 'offers'
      ? { href: '/offers', label: isProvider ? t('jobs.backToPendingOffers') : t('jobs.backToMySentOffers') }
      : from === 'bookings'
        ? { href: withTab('/bookings'), label: t('jobs.backToBookingTasks') }
        : from === 'calendar'
          ? { href: '/provider/calendar', label: t('jobs.backToCalendar') }
          : from === 'jobs'
            ? { href: withTab('/provider/jobs'), label: t('jobs.backToJobs2') }
            : isProvider
              ? { href: '/provider/jobs', label: t('jobs.backToJobs2') }
              : { href: '/bookings', label: t('jobs.backToBookingTasks') }

  // offer_status is 'pending' twice over — for an offer nobody has answered and
  // for a job whose provider is on the way. offer_job_status separates them, so
  // the buttons never have to guess which one they are looking at.
  const unanswered = offer.offer_job_status === 'pending' && status === 'pending'

  const tooEarly = !canStart(offer)

  // Provider lifecycle: Start Now → Mark as Arrived → Mark Complete.
  //
  // Gated on the job, never on the screen it was opened from. Tying it to `from`
  // meant a provider who accepted an offer from the offers list — arriving here
  // as ?from=offers — was shown no way to start the work they had just taken.
  // `from` decides the back link and nothing else.
  const providerLifecycle = isProvider && !unanswered
  const providerPrimary = primaryAction(status)

  // Accept / Reject belong to an offer that has not been answered yet, whichever
  // screen the provider opened it from.
  const providerCanAnswer = isProvider && unanswered

  const settled = ['completed', 'canceled', 'cancelled'].includes(status)
  const providerCanCancel =
    providerLifecycle && ['scheduled', 'pending', 'active'].includes(status)

  // The customer's own cancel. What it is called depends on what it is: an
  // offer nobody has answered is still an offer, but once the provider has
  // accepted it there is scheduled work, and the mobile detail screen calls
  // that "Cancel Booking". Saying "Cancel Offer" over an active job read as
  // cancelling something that had already happened.
  const customerCanCancel =
    !isProvider && !settled && status !== 'awaiting_confirmation'
  const customerCancelLabel = unanswered ? t('jobs.cancelOffer') : t('jobs.cancelBooking')

  // Only while the series is live — nothing upcoming to stop from a finished or
  // canceled booking, and a pending offer never started one.
  const canCancelRecurring =
    offer.is_recurring && ['scheduled', 'active', 'awaiting_confirmation'].includes(status)

  // job_offers has no has_customer_review / has_provider_review column — those
  // reads were always undefined, so "Give a Review" came back after every
  // review and each new one overwrote the last (the RPC upserts on offer_id).
  // The review row itself is the only record of it, so ask that.
  const alreadyReviewed = isProvider ? reviewed.provider : reviewed.customer

  // A cash job's service money never passes through the platform, so the offer
  // keeps payment_status 'pending' for good and payment_id stays null — only
  // the monthly tokens get payment rows. Gating on 'paid' therefore withheld
  // the review and the receipt from every completed recurring cash job,
  // permanently. Completion is the condition for a cash job; 'paid' is only
  // meaningful when the platform took the money.
  const cashJob = offer.pay_through_platform === false

  const canReview =
    status === 'completed' && !alreadyReviewed &&
    (cashJob || !offer.payment_status || offer.payment_status === 'paid')

  // The offer's own payment when the platform took it; otherwise whatever this
  // user actually paid against this job — for a cash job, the month's token.
  // A cash job has no payments row for the service — that money went hand to
  // hand — so its slip is built from the job itself. Everything else has a real
  // payment behind it, and /receipts/[paymentId] describes that.
  const cashReceipt = cashJob && status === 'completed'

  const receiptId =
    offer.payment_status === 'paid' && offer.payment_id ? offer.payment_id : jobPaymentId
  const hasReceipt = cashReceipt || Boolean(receiptId) || Boolean(tokenPaymentId)

  const hasActions = Boolean(
    providerCanAnswer ||
    (providerLifecycle && (providerPrimary || status === 'awaiting_confirmation')) ||
    (!isProvider && status === 'awaiting_confirmation') ||
    customerCanCancel || canCancelRecurring || canReview || hasReceipt,
  )

  return (
    <div className="space-y-5">
      <BackLink href={back.href}>{back.label}</BackLink>
      {error && <ErrorNote>{error}</ErrorNote>}

      <Card bleed>
        <JobPhotos urls={offer.image_urls ?? (offer.image_url ? [offer.image_url] : [])}
          skill={{ name: offer.skill_name, color: offer.skill_color }} variant="detail" className="h-64 w-full" />
        <div className="p-5">
          <div className="flex flex-col items-start justify-between gap-3 sm:flex-row">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-xl font-bold tracking-tight text-ink">
                  {offer.offer_title ?? offer.service_description}
                </h1>
                <Badge value={status} />
              </div>
              <p className="mt-1 text-sm text-ink-70">
                {date(offer.service_date)} at {time(offer.service_time)}
                {offer.service_duration ? ` · ${offer.service_duration}` : ''}
              </p>

              <div className="mt-2 flex flex-wrap gap-1.5">
                {offer.skill_name && (
                  <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold text-ink"
                    style={{ backgroundColor: offer.skill_color ?? '#EEFFF2' }}>
                    {offer.skill_name}
                  </span>
                )}
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  offer.pay_through_platform ? 'bg-accent-soft text-ink' : 'bg-warm text-[#9a5b25]'}`}>
                  {offer.pay_through_platform ? t('jobs.paidThroughPlatform') : 'Cash'}
                </span>
                {/* Recurring tag, as the mobile card and detail both show it. */}
                {offer.is_recurring && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#e6f1f8] px-2.5 py-0.5 text-xs font-semibold text-secondary">
                    <svg viewBox="0 0 24 24" fill="none" className="h-3 w-3">
                      <path d="M17 2l4 4-4 4M3 11V9a4 4 0 014-4h14M7 22l-4-4 4-4m14-3v2a4 4 0 01-4 4H3"
                        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Recurring · {offer.recurrence_type}
                    {offer.occurrence_number ? ` #${offer.occurrence_number}` : ''}
                  </span>
                )}
              </div>
            </div>
            <p className="text-2xl font-bold tabular-nums text-ink">
              {money(offer.payment_amount, currency)}
            </p>
          </div>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card title={isProvider ? t('jobs.customer') : t('jobs.provider')}>
          <div className="flex items-center gap-3">
            <Avatar src={otherAvatar} name={otherName} />
            <div className="min-w-0">
              <p className="truncate font-semibold text-ink">{otherName ?? '—'}</p>
              {/* Both directions: the customer opens the provider's profile, the
                  provider opens the customer's. */}
              {otherId && (
                <Link href={isProvider ? `/customers/${otherId}` : `/providers/${otherId}`}
                  className="text-sm font-semibold text-accent-role hover:underline">
                  {t('jobs.viewProfile')}
                </Link>
              )}
            </div>
          </div>
          <div className="mt-4 border-t border-line-soft pt-4">
            <Link href={offer.chat_id ? `/chats/${offer.chat_id}` : '/chats'}>
              <Button variant="outline" size="sm" fullWidth>
                {isProvider ? t('jobs.chatWithCustomer') : t('jobs.chatNow')}
              </Button>
            </Link>
          </div>
        </Card>

        <Card title={t('jobs.details')} className="lg:col-span-2">
          <dl className="grid gap-4 sm:grid-cols-2">
            {([
              ['Service Fee', money(offer.payment_amount, currency)],
              ['Duration', offer.service_duration],
              ['Location', offer.location_address],
              offer.cancellation_reason ? ['Cancellation reason', offer.cancellation_reason] : null,
            ].filter(Boolean) as [string, string | null][]).map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-50">{k}</dt>
                <dd className="mt-0.5 break-words text-sm text-ink-80">{v || '—'}</dd>
              </div>
            ))}
          </dl>
          {offer.service_description && (
            <div className="mt-4 border-t border-line-soft pt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-50">{t('jobs.description')}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-ink-80">{offer.service_description}</p>
            </div>
          )}
        </Card>
      </div>

      <Card title={t('jobs.location')}>
        <MapView lat={offer.location_lat} lng={offer.location_lng} address={offer.location_address} />
      </Card>

      {hasActions && (
        <Card title={t('jobs.actions')}>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap [&>*]:w-full sm:[&>*]:w-auto">
            {/* ── Offer not answered yet (provider) ───────────────────────── */}
            {providerCanAnswer && (
              <>
                <Button loading={busy} onClick={() => void act('accept')}>{t('jobs.accept')}</Button>
                <Button variant="outline" disabled={busy}
                  onClick={() => void act('reject')}>{t('jobs.reject')}</Button>
              </>
            )}

            {/* ── Accepted work (provider) ────────────────────────────────── */}
            {providerLifecycle && providerPrimary && (
              <Button loading={busy}
                disabled={busy || (providerPrimary[1] === 'start' && tooEarly)}
                onClick={() => void jobs.providerPrimary(offer)}>
                {providerPrimary[0]}
              </Button>
            )}
            {providerLifecycle && providerPrimary?.[1] === 'start' && tooEarly && (
              <span className="inline-flex items-center justify-center rounded-xl bg-surface-muted px-4 py-2 text-sm font-medium text-ink-50">
                Can be started from an hour before {date(offer.service_date)}, {time(offer.service_time)}
              </span>
            )}
            {providerLifecycle && status === 'awaiting_confirmation' && (
              <span className="inline-flex items-center justify-center rounded-xl bg-surface-muted px-4 py-2 text-sm font-medium text-ink-50">
                {t('jobs.awaitingCustomerConfirmation')}
              </span>
            )}
            {providerCanCancel && (
              <Button variant="outline" disabled={busy}
                onClick={() => window.confirm('Cancel this job?') && void act('cancel')}>
                {t('jobs.cancel')}
              </Button>
            )}

            {/* ── Confirmation and cancellation (customer) ────────────────── */}
            {!isProvider && status === 'awaiting_confirmation' && (
              <>
                {/* Paid through the platform: the charge closes the job, so the
                    payment page owns this step and the webhook completes it. */}
                {offer.pay_through_platform !== false ? (
                  <Link href={`/pay/${offer.offer_id}`}><Button>Confirm &amp; Pay</Button></Link>
                ) : (
                  <Button loading={busy} onClick={() => void jobs.customerCompleteCash(offer)}>
                    {t('jobs.markComplete')}
                  </Button>
                )}
                <Button variant="outline" disabled={busy}
                  onClick={() => jobs.askNotCompleted(offer.offer_id)}>
                  {t('jobs.notCompleted')}
                </Button>
              </>
            )}
            {customerCanCancel && (
              <Button variant="danger" disabled={busy}
                onClick={() => window.confirm(
                  unanswered
                    ? t('jobs.cancelThisOffer')
                    : t('jobs.cancelThisBookingTheProviderWill'),
                ) && void act('cancel')}>
                {customerCancelLabel}
              </Button>
            )}

            {/* ── Shared ──────────────────────────────────────────────────── */}
            {canCancelRecurring && (
              <Button variant="outline" disabled={busy} onClick={() => setCancelOpen(true)}>
                {t('jobs.cancelRecurringRequest')}
              </Button>
            )}
            {canReview && (
              <Link href={`/reviews/new/${offer.offer_id}`}><Button>{t('jobs.giveAReview')}</Button></Link>
            )}
            {/* The payment slip, once there is a payment to show. */}
            {cashReceipt && (
              <Link href={`/receipts/job/${offer.offer_id}?from=job`}>
                <Button variant="outline">{t('jobs.cashReceipt')}</Button>
              </Link>
            )}
            {!cashReceipt && receiptId && (
              <Link href={`/receipts/${receiptId}?from=job`}>
                <Button variant="outline">{t('jobs.paymentReceipt')}</Button>
              </Link>
            )}
            {/* The monthly subscription is charged apart from the work, so it
                keeps its own slip whether the job was cash or card. */}
            {tokenPaymentId && (
              <Link href={`/receipts/${tokenPaymentId}?from=job`}>
                <Button variant="outline">{t('jobs.subscriptionReceipt')}</Button>
              </Link>
            )}
          </div>
        </Card>
      )}

      {jobs.dialogs}

      <CancelRecurringDialog
        open={cancelOpen}
        busy={busy}
        onClose={() => setCancelOpen(false)}
        onSubmit={async (reason) => {
          await act('request-cancel-recurring', { reason })
          setCancelOpen(false)
        }}
      />
    </div>
  )
}

interface PaymentRow {
  payment_id: string
  payment_kind: string | null
  payer_id: string | null
  payee_id: string | null
}

export default function JobDetailPage({ params }: { params: Promise<{ offerId: string }> }) {
  const { offerId } = use(params)
  return (
    <Suspense fallback={<Spinner />}>
      <JobDetail offerId={offerId} />
    </Suspense>
  )
}
