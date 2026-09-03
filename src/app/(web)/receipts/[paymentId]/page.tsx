'use client'

import { use, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { api } from '@/lib/web/api'
import { useSession } from '@/lib/web/session'
import {
  BackLink, Badge, Button, Card, ErrorNote, Spinner, date, dateTime, money,
} from '@/components/web/ui'
import { useT } from '@/lib/i18n'

interface Receipt {
  receipt_id?: string | null
  payment_id: string
  job_title?: string | null
  service_date?: string | null
  payment_date?: string | null
  payment_method?: string | null
  payment_kind?: string | null
  status?: string | null
  currency?: string | null
  is_recurring?: boolean | null
  is_cash_payment?: boolean | null
  customer?: { name?: string | null; email?: string | null } | null
  provider?: { name?: string | null; email?: string | null } | null
  amounts?: {
    service_fee?: number
    platform_fee?: number
    customer_token?: number
    provider_token?: number
    cash_amount?: number
    provider_receives?: number
    total_paid?: number
  } | null
}

/**
 * Payment slip — the mobile PaymentReceipt screen.
 *
 * Both sides see it, but the line that matters differs: the customer cares what
 * they were charged, the provider what they received. The API returns both, so
 * the totals row is chosen by role rather than recomputed here.
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

export default function ReceiptPage({ params }: { params: Promise<{ paymentId: string }> }) {
  const { paymentId } = use(params)
  const t = useT()
  const from = useSearchParams().get('from')
  const { isProvider } = useSession()

  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(() => {
      void (async () => {
        const res = await api.get<Receipt>(`/payments/receipt/${paymentId}`)
        if (cancelled) return
        if (res.success && res.data) setReceipt(res.data)
        else setError(res.error ?? t('payments.couldNotLoadThisReceipt'))
        setLoading(false)
      })()
    }, 0)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [paymentId])

  if (loading) return <Spinner />
  if (!receipt) return <ErrorNote>{error ?? t('payments.receiptNotFound')}</ErrorNote>

  const back = backTo(from, isProvider)
  const a = receipt.amounts ?? {}
  const currency = receipt.currency ?? 'EUR'

  // A cash job's service money is handed over directly, so the platform only
  // ever sees the monthly tokens — and the receipt for one of those is a
  // subscription charge, not the job's payment. Read as a job receipt it said
  // the provider "received EUR 0.00" for a EUR 50 job and called the EUR 5
  // token a service fee.
  const kind = receipt.payment_kind
  const isToken = kind === 'provider_token' || kind === 'customer_token'

  const lines: [string, number | undefined][] = isToken
    ? [
        ['Monthly subscription', a.total_paid],
        ['Job settled in cash', receipt.is_cash_payment ? a.cash_amount : undefined],
      ]
    : [
        ['Service fee', a.service_fee],
        ['Platform fee', a.platform_fee],
        ['Customer subscription', a.customer_token],
        ['Provider subscription', a.provider_token],
        ['Paid in cash', a.cash_amount],
      ]

  const title = isToken ? t('payments.subscriptionReceipt') : t('payments.paymentReceipt')

  // Money out for a token, money in for a completed job.
  const totalLabel = isToken
    ? t('payments.youPaid')
    : isProvider ? t('payments.youReceived') : t('payments.totalPaid')
  const totalValue = isToken
    ? a.total_paid
    : isProvider ? a.provider_receives : a.total_paid

  return (
    <div className="space-y-5">
      <div className="print:hidden">
        <BackLink href={back.href}>{t(back.labelKey)}</BackLink>
      </div>

      <Card bleed>
        <div className="border-b border-line-soft bg-accent-soft px-6 py-5 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-70">
            {title}
          </p>
          <p className="mt-1 text-[1.75rem] font-bold tabular-nums text-accent-role">
            {money(totalValue, currency)}
          </p>
          <p className="mt-0.5 text-xs text-ink-70">{totalLabel}</p>
          {isToken && (
            <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-ink-70">
              {t('payments.thisIsYourMonthlySubscriptionFor')}
            </p>
          )}

          <div className="mt-3 flex flex-wrap justify-center gap-1.5">
            {receipt.status && <Badge value={receipt.status} />}
            {receipt.is_recurring && (
              <span className="rounded-full bg-[#e6f1f8] px-2.5 py-0.5 text-xs font-semibold text-secondary">
                {t('payments.recurringJob')}
              </span>
            )}
            {receipt.is_cash_payment && (
              <span className="rounded-full bg-warm px-2.5 py-0.5 text-xs font-semibold text-[#9a5b25]">
                {t('payments.cash')}
              </span>
            )}
          </div>
        </div>

        <div className="px-6 py-5">
          <dl className="grid gap-4 sm:grid-cols-2">
            {([
              ['Job', receipt.job_title],
              ['Service date', receipt.service_date ? date(receipt.service_date) : null],
              ['Paid on', receipt.payment_date ? dateTime(receipt.payment_date) : null],
              ['Method', receipt.payment_method ?? (receipt.is_cash_payment ? 'Cash' : t('payments.card'))],
              ['Customer', receipt.customer?.name],
              ['Provider', receipt.provider?.name],
              ['Receipt ID', receipt.receipt_id ?? receipt.payment_id],
            ] as [string, string | null | undefined][]).map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-50">{k}</dt>
                <dd className="mt-0.5 break-words text-sm text-ink-80">{v || '—'}</dd>
              </div>
            ))}
          </dl>

          <dl className="mt-5 space-y-2 border-t border-line-soft pt-5 text-sm">
            {lines.map(([label, value]) =>
              value == null || value === 0 ? null : (
                <div key={label} className="flex justify-between gap-4">
                  <dt className="text-ink-70">{label}</dt>
                  <dd className="font-medium tabular-nums">{money(value, currency)}</dd>
                </div>
              ),
            )}
            <div className="flex justify-between gap-4 border-t border-line-soft pt-2.5 text-base">
              <dt className="font-bold text-ink">{totalLabel}</dt>
              <dd className="font-bold tabular-nums text-accent-role">
                {money(totalValue, currency)}
              </dd>
            </div>
          </dl>

          {/* The button that starts the print has no place in its output. */}
          <Button variant="outline" fullWidth className="mt-5 print:hidden"
            onClick={() => window.print()}>
            Print / Save as PDF
          </Button>
        </div>
      </Card>
    </div>
  )
}
