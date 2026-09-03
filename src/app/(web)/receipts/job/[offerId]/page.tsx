'use client'

import { use, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

import { api } from '@/lib/web/api'
import { useSession } from '@/lib/web/session'
import {
  BackLink, Badge, Button, Card, ErrorNote, Spinner, date, money,
} from '@/components/web/ui'
import { useT } from '@/lib/i18n'

interface Offer {
  offer_id: string
  offer_title: string | null
  service_description: string | null
  service_date: string
  service_duration: string | null
  payment_amount: string
  currency: string | null
  skill_name: string | null
  customer_name: string | null
  provider_name: string | null
  location_address: string | null
  is_recurring: boolean
  occurrence_number: number | null
  pay_through_platform: boolean
  offer_status: string
}

interface HistoryRow {
  payment_id: string
  offer_id: string
  total_amount: number
  paid_at?: string | null
}

/**
 * The slip for a job settled in cash.
 *
 * /receipts/[paymentId] can only describe money the platform handled, and on a
 * cash job that is the monthly subscription alone — which is why opening one
 * showed a EUR 5 subscription where a EUR 50 job was expected. The service
 * money never becomes a payments row, so its record has to be built from the
 * job: this is what was agreed, what was handed over, and what the platform
 * charged on top.
 */
/**
 * Where "Back" goes, decided by the screen that linked here rather than by the
 * viewer's role. A receipt is reached from the earnings list, from a job, and
 * from a booking, and each of those is the right place to return to.
 */
function backTo(from: string | null, isProvider: boolean, offerId?: string | null) {
  if (from === 'earnings') return { href: '/provider/earnings', labelKey: 'payments.backToPaymentHistory' }
  if (from === 'jobs') return { href: '/provider/jobs', labelKey: 'payments.backToJobs' }
  if (from === 'bookings') return { href: '/bookings', labelKey: 'payments.backToBookingTasks' }
  if (from === 'payments') return { href: '/payments', labelKey: 'payments.backToPaymentHistory' }
  if (from === 'job' && offerId) return { href: `/jobs/${offerId}`, labelKey: 'payments.backToTheJob' }
  return isProvider
    ? { href: '/provider/earnings', labelKey: 'payments.backToPaymentHistory' }
    : { href: '/bookings', labelKey: 'payments.backToBookingTasks' }
}

export default function CashJobReceiptPage({
  params,
}: {
  params: Promise<{ offerId: string }>
}) {
  const { offerId } = use(params)
  const t = useT()
  const from = useSearchParams().get('from')
  const { isProvider } = useSession()

  const [offer, setOffer] = useState<Offer | null>(null)
  const [token, setToken] = useState<HistoryRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [o, h] = await Promise.all([
        api.get<Offer>(`/offers/${offerId}`),
        api.get<HistoryRow[]>('/payments/history'),
      ])
      if (cancelled) return
      if (o.success && o.data) setOffer(o.data)
      else setError(o.error ?? t('payments.couldNotLoadThisJob'))
      // The viewer's own subscription for this job, if they have paid one.
      if (h.success && Array.isArray(h.data)) {
        setToken(h.data.find((r) => r.offer_id === offerId) ?? null)
      }
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [offerId])

  if (loading) return <Spinner />
  if (error) return <ErrorNote>{error}</ErrorNote>
  if (!offer) return null

  const back = backTo(from, isProvider, offer.offer_id)
  const currency = offer.currency ?? 'EUR'
  const amount = parseFloat(offer.payment_amount) || 0

  const rows: [string, string][] = [
    ['Job', offer.offer_title ?? offer.service_description ?? 'Job'],
    ['Service date', date(offer.service_date)],
    ['Customer', offer.customer_name ?? '—'],
    ['Provider', offer.provider_name ?? '—'],
    ['Method', 'Cash, paid directly'],
  ]
  if (offer.skill_name) rows.splice(1, 0, ['Category', offer.skill_name])
  if (offer.service_duration) rows.splice(2, 0, ['Duration', offer.service_duration])

  return (
    <div className="space-y-5">
      <div className="print:hidden">
        <BackLink href={back.href}>{t(back.labelKey)}</BackLink>
      </div>

      <Card bleed>
        <div className="border-b border-line-soft bg-warm px-6 py-5 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-70">
            {t('payments.cashJobReceipt')}
          </p>
          <p className="mt-1 text-[1.75rem] font-bold tabular-nums text-ink">
            {money(amount, currency)}
          </p>
          <p className="mt-0.5 text-xs text-ink-70">
            {isProvider ? t('payments.receivedInCash') : t('payments.paidInCash')}
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-1.5">
            <Badge value={offer.offer_status} />
            <span className="rounded-full bg-warm px-2.5 py-0.5 text-xs font-semibold text-[#9a5b25]">
              {t('payments.cash')}
            </span>
            {offer.is_recurring && (
              <span className="rounded-full bg-[#e6f1f8] px-2.5 py-0.5 text-xs font-semibold text-secondary">
                Recurring{offer.occurrence_number ? ` · #${offer.occurrence_number}` : ''}
              </span>
            )}
          </div>
        </div>

        <div className="px-6 py-5">
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {rows.map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-50">{k}</dt>
                <dd className="mt-0.5 text-sm text-ink">{v}</dd>
              </div>
            ))}
            {offer.location_address && (
              <div className="sm:col-span-2">
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-50">
                  {t('payments.location')}
                </dt>
                <dd className="mt-0.5 text-sm text-ink">{offer.location_address}</dd>
              </div>
            )}
          </dl>

          <dl className="mt-5 space-y-2 border-t border-line-soft pt-4 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-ink-70">{t('payments.servicePaidInCash')}</dt>
              <dd className="font-semibold tabular-nums text-ink">{money(amount, currency)}</dd>
            </div>
          </dl>

          <p className="mt-4 text-xs leading-relaxed text-ink-50">
            {t('payments.thisSlipCoversTheServiceOnly')}
          </p>

          {/* The platform's fee is a separate transaction with its own receipt,
              so it is linked rather than folded into the job's figures. */}
          {token && (
            <div className="mt-4 rounded-lg border border-line bg-surface-muted px-4 py-3 print:hidden">
              <p className="text-sm font-semibold text-ink">
                Monthly subscription · {money(token.total_amount, currency)}
              </p>
              <p className="mt-0.5 text-xs text-ink-70">
                {t('payments.chargedByHelpershobForRecurringWork')}
              </p>
              <Link href={`/receipts/${token.payment_id}?from=${from ?? 'job'}`}
                className="mt-1.5 inline-block text-sm font-semibold text-accent-role hover:underline">
                {t('payments.viewSubscriptionReceipt')}
              </Link>
            </div>
          )}

          <Button variant="outline" fullWidth className="mt-5 print:hidden"
            onClick={() => window.print()}>
            Print / Save as PDF
          </Button>
        </div>
      </Card>
    </div>
  )
}
