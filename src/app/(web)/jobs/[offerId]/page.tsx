'use client'

import { Suspense, use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

import { api } from '@/lib/web/api'
import { useSession } from '@/lib/web/session'
import MapView from '@/components/web/MapView'
import CancelRecurringDialog from '@/components/web/CancelRecurringDialog'
import { useJobActions, canStart, primaryAction } from '@/lib/web/useJobActions'
import {
  Avatar, BackLink, Badge, Button, Card, ErrorNote, Spinner, Thumb,
  date, money, time,
} from '@/components/web/ui'

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
  has_customer_review: boolean
  has_provider_review: boolean
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
  const search = useSearchParams()
  const raw = search.get('from')
  const from = SOURCES.includes(raw as Source) ? (raw as Source) : null
  // The list's open tab, so returning puts you back where you were rather than
  // on the list's first tab.
  const tab = search.get('tab')
  const withTab = (href: string) => (tab ? `${href}?tab=${encodeURIComponent(tab)}` : href)

  const { isProvider } = useSession()

  const [offer, setOffer] = useState<Offer | null>(null)
  const [loading, setLoading] = useState(true)
  const [localError, setLocalError] = useState<string | null>(null)
  const [cancelOpen, setCancelOpen] = useState(false)

  const load = useCallback(async () => {
    const res = await api.get<Offer>(`/offers/${offerId}`)
    if (res.success && res.data) { setOffer(res.data); setLocalError(null) }
    else setLocalError(res.error ?? 'Could not load this booking')
    setLoading(false)
  }, [offerId])

  useEffect(() => {
    let cancelled = false
    const t = setTimeout(() => { if (!cancelled) void load() }, 0)
    return () => { cancelled = true; clearTimeout(t) }
  }, [load])

  // Every lifecycle action, with the gates the mobile app puts before them.
  const jobs = useJobActions(load)
  const busy = jobs.busyId !== null
  const error = localError ?? jobs.error

  async function act(action: string, extra?: Record<string, unknown>) {
    await jobs.post(offerId, action, extra)
  }

  if (loading) return <Spinner />
  if (!offer) return <ErrorNote>{error ?? 'Booking not found'}</ErrorNote>

  const status = offer.offer_status
  const currency = offer.currency ?? 'EUR'

  const otherName = isProvider ? offer.customer_name : offer.provider_name
  const otherAvatar = isProvider ? offer.customer_avatar : offer.provider_avatar
  const otherId = isProvider ? offer.customer_id : offer.provider_id

  // Go back where you actually came from. Sidebar wording, so the link names
  // the screen the user will land on.
  const back =
    from === 'offers'
      ? { href: '/offers', label: isProvider ? 'Back to Pending Offers' : 'Back to My Sent Offers' }
      : from === 'bookings'
        ? { href: withTab('/bookings'), label: 'Back to Booking/Tasks' }
        : from === 'calendar'
          ? { href: '/provider/calendar', label: 'Back to Calendar' }
          : from === 'jobs'
            ? { href: withTab('/provider/jobs'), label: 'Back to Jobs' }
            : isProvider
              ? { href: '/provider/jobs', label: 'Back to Jobs' }
              : { href: '/bookings', label: 'Back to Booking/Tasks' }

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

  // The customer's own cancel. The customer's side calls this an offer from the
  // moment they send it, so the wording stays "Cancel Offer" after acceptance
  // too — the mobile detail screen says "Cancel Booking" here instead.
  const customerCanCancel =
    !isProvider && !settled && status !== 'awaiting_confirmation'
  const customerCancelLabel = 'Cancel Offer'

  // Only while the series is live — nothing upcoming to stop from a finished or
  // canceled booking, and a pending offer never started one.
  const canCancelRecurring =
    offer.is_recurring && ['scheduled', 'active', 'awaiting_confirmation'].includes(status)

  const alreadyReviewed = isProvider ? offer.has_provider_review : offer.has_customer_review
  const canReview =
    status === 'completed' && !alreadyReviewed &&
    (!offer.payment_status || offer.payment_status === 'paid')

  const hasReceipt = Boolean(offer.payment_id) && offer.payment_status === 'paid'

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
        {offer.image_url && <Thumb src={offer.image_url} className="h-48 w-full" />}
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
                  {offer.pay_through_platform ? 'Paid through platform' : 'Cash'}
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
        <Card title={isProvider ? 'Customer' : 'Provider'}>
          <div className="flex items-center gap-3">
            <Avatar src={otherAvatar} name={otherName} />
            <div className="min-w-0">
              <p className="truncate font-semibold text-ink">{otherName ?? '—'}</p>
              {!isProvider && otherId && (
                <Link href={`/providers/${otherId}`}
                  className="text-sm font-semibold text-accent-role hover:underline">
                  View profile
                </Link>
              )}
            </div>
          </div>
          <div className="mt-4 border-t border-line-soft pt-4">
            <Link href={offer.chat_id ? `/chats/${offer.chat_id}` : '/chats'}>
              <Button variant="outline" size="sm" fullWidth>
                {isProvider ? 'Chat with Customer' : 'Chat Now'}
              </Button>
            </Link>
          </div>
        </Card>

        <Card title="Details" className="lg:col-span-2">
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
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-50">Description</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-ink-80">{offer.service_description}</p>
            </div>
          )}
        </Card>
      </div>

      <Card title="Location">
        <MapView lat={offer.location_lat} lng={offer.location_lng} address={offer.location_address} />
      </Card>

      {hasActions && (
        <Card title="Actions">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap [&>*]:w-full sm:[&>*]:w-auto">
            {/* ── Offer not answered yet (provider) ───────────────────────── */}
            {providerCanAnswer && (
              <>
                <Button loading={busy} onClick={() => void act('accept')}>Accept</Button>
                <Button variant="outline" disabled={busy}
                  onClick={() => void act('reject')}>Reject</Button>
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
                Awaiting customer confirmation
              </span>
            )}
            {providerCanCancel && (
              <Button variant="outline" disabled={busy}
                onClick={() => window.confirm('Cancel this job?') && void act('cancel')}>
                Cancel
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
                    Mark Complete
                  </Button>
                )}
                <Button variant="outline" disabled={busy}
                  onClick={() => jobs.askNotCompleted(offer.offer_id)}>
                  Not Completed
                </Button>
              </>
            )}
            {customerCanCancel && (
              <Button variant="danger" disabled={busy}
                onClick={() => window.confirm(`${customerCancelLabel}?`) && void act('cancel')}>
                {customerCancelLabel}
              </Button>
            )}

            {/* ── Shared ──────────────────────────────────────────────────── */}
            {canCancelRecurring && (
              <Button variant="outline" disabled={busy} onClick={() => setCancelOpen(true)}>
                Cancel Recurring Request
              </Button>
            )}
            {canReview && (
              <Link href={`/reviews/new/${offer.offer_id}`}><Button>Give a Review</Button></Link>
            )}
            {/* The payment slip, once there is a payment to show. */}
            {hasReceipt && (
              <Link href={`/receipts/${offer.payment_id}`}>
                <Button variant="outline">Payment Receipt</Button>
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

export default function JobDetailPage({ params }: { params: Promise<{ offerId: string }> }) {
  const { offerId } = use(params)
  return (
    <Suspense fallback={<Spinner />}>
      <JobDetail offerId={offerId} />
    </Suspense>
  )
}
