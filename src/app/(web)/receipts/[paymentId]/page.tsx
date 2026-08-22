'use client'

import { use, useEffect, useState } from 'react'
import { api } from '@/lib/web/api'
import { useSession } from '@/lib/web/session'
import {
  BackLink, Badge, Button, Card, ErrorNote, Spinner, date, dateTime, money,
} from '@/components/web/ui'

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
export default function ReceiptPage({ params }: { params: Promise<{ paymentId: string }> }) {
  const { paymentId } = use(params)
  const { isProvider } = useSession()

  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const t = setTimeout(() => {
      void (async () => {
        const res = await api.get<Receipt>(`/payments/receipt/${paymentId}`)
        if (cancelled) return
        if (res.success && res.data) setReceipt(res.data)
        else setError(res.error ?? 'Could not load this receipt')
        setLoading(false)
      })()
    }, 0)
    return () => { cancelled = true; clearTimeout(t) }
  }, [paymentId])

  if (loading) return <Spinner />
  if (!receipt) return <ErrorNote>{error ?? 'Receipt not found'}</ErrorNote>

  const a = receipt.amounts ?? {}
  const currency = receipt.currency ?? 'EUR'

  const lines: [string, number | undefined][] = [
    ['Service fee', a.service_fee],
    ['Platform fee', a.platform_fee],
    ['Customer subscription', a.customer_token],
    ['Provider subscription', a.provider_token],
    ['Paid in cash', a.cash_amount],
  ]

  const totalLabel = isProvider ? 'You received' : 'Total paid'
  const totalValue = isProvider ? a.provider_receives : a.total_paid

  return (
    <div className="space-y-5">
      <BackLink href={isProvider ? '/provider/earnings' : '/bookings'}>Back</BackLink>

      <Card bleed>
        <div className="border-b border-line-soft bg-accent-soft px-6 py-5 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-70">
            Payment Receipt
          </p>
          <p className="mt-1 text-[1.75rem] font-bold tabular-nums text-accent-role">
            {money(totalValue, currency)}
          </p>
          <p className="mt-0.5 text-xs text-ink-70">{totalLabel}</p>
          <div className="mt-3 flex flex-wrap justify-center gap-1.5">
            {receipt.status && <Badge value={receipt.status} />}
            {receipt.is_recurring && (
              <span className="rounded-full bg-[#e6f1f8] px-2.5 py-0.5 text-xs font-semibold text-secondary">
                Recurring Job
              </span>
            )}
            {receipt.is_cash_payment && (
              <span className="rounded-full bg-warm px-2.5 py-0.5 text-xs font-semibold text-[#9a5b25]">
                Cash
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
              ['Method', receipt.payment_method ?? (receipt.is_cash_payment ? 'Cash' : 'Card')],
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

          <Button variant="outline" fullWidth className="mt-5" onClick={() => window.print()}>
            Print / Save as PDF
          </Button>
        </div>
      </Card>
    </div>
  )
}
