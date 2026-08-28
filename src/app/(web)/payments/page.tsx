'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

import { api } from '@/lib/web/api'
import {
  Badge, Card, Empty, ErrorNote, ListSkeleton, PageTitle, dateTime, money,
} from '@/components/web/ui'

interface Payment {
  payment_id: string
  offer_id?: string | null
  job_title?: string | null
  provider_name?: string | null
  total_amount?: string | number | null
  platform_fee?: string | number | null
  cash_amount?: string | number | null
  payment_status: string
  currency?: string | null
  paid_at?: string | null
  created_at?: string | null
  is_recurring?: boolean | null
  is_cash_payment?: boolean | null
  /** Work paid for, or a fee charged on top. */
  kind?: 'job' | 'fee'
}

interface CompletedOffer {
  offer_id: string
  offer_title: string | null
  service_date: string | null
  payment_amount: string | number | null
  currency: string | null
  is_recurring: boolean | null
  pay_through_platform: boolean | null
  provider_name: string | null
}

/**
 * What the customer has paid — the other half of the provider's earnings screen.
 *
 * Two things end up here and they are not the same: the money for the work, and
 * the monthly subscription HelpersHob charges on recurring bookings. Cash jobs
 * come from the offers, because money handed over directly never becomes a
 * payments row and so cannot come from /payments/history at all.
 */
export default function CustomerPaymentsPage() {
  const [rows, setRows] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [h, o] = await Promise.all([
        api.get<{ payments?: Payment[] } | Payment[]>('/payments/history'),
        api.get<CompletedOffer[]>('/offers?status=completed&limit=100'),
      ])
      if (cancelled) return

      if (!h.success) setError(h.error ?? 'Could not load your payments')

      const paid = h.success && h.data
        ? (Array.isArray(h.data) ? h.data : (h.data.payments ?? []))
        : []

      // A cash job's service money never reaches the platform.
      const cashJobs: Payment[] = (o.success && Array.isArray(o.data) ? o.data : [])
        .filter((j) => j.pay_through_platform === false)
        .map((j) => ({
          payment_id: `offer:${j.offer_id}`,
          offer_id: j.offer_id,
          job_title: j.offer_title,
          provider_name: j.provider_name,
          paid_at: j.service_date,
          total_amount: j.payment_amount,
          cash_amount: j.payment_amount,
          payment_status: 'paid',
          currency: j.currency,
          is_recurring: j.is_recurring,
          is_cash_payment: true,
          kind: 'job' as const,
        }))

      // history carries no payment_kind, but a fee is the only thing charged
      // against a job whose service money the platform never handled.
      const seen = new Set(cashJobs.map((j) => j.offer_id))
      const fromHistory: Payment[] = paid.map((p) => ({
        ...p,
        kind: p.offer_id && seen.has(p.offer_id) ? ('fee' as const) : ('job' as const),
      }))

      const all = [...fromHistory, ...cashJobs]
      all.sort((a, b) => {
        const at = new Date(a.paid_at ?? a.created_at ?? 0).getTime()
        const bt = new Date(b.paid_at ?? b.created_at ?? 0).getTime()
        return bt - at
      })

      setRows(all)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  const total = rows.reduce((sum, p) => sum + (Number(p.total_amount) || 0), 0)
  const currency = rows[0]?.currency ?? 'EUR'

  return (
    <div className="space-y-5">
      <PageTitle title="Payment History" sub="What you have paid, and what it was for." />

      {error && <ErrorNote>{error}</ErrorNote>}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-line bg-surface px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-50">Total paid</p>
          <p className="mt-1.5 text-2xl font-bold tabular-nums text-accent-role">
            {money(total, currency)}
          </p>
        </div>
        <div className="rounded-xl border border-line bg-surface px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-50">Payments</p>
          <p className="mt-1.5 text-2xl font-bold tabular-nums text-accent-role">{rows.length}</p>
        </div>
      </div>

      <Card title="Your payments" bleed>
        {loading ? <ListSkeleton /> : rows.length === 0 ? (
          <Empty title="Nothing paid yet"
            sub="Receipts appear here once you have paid for a booking." />
        ) : (
          <ul className="divide-y divide-line-soft">
            {rows.map((p) => (
              <li key={p.payment_id}>
                <Link
                  // A fee has its own payment and its own receipt; a cash job's
                  // slip is built from the job, since it never became a payment.
                  href={p.kind === 'job' && p.is_cash_payment && p.offer_id
                    ? `/receipts/job/${p.offer_id}?from=payments`
                    : `/receipts/${p.payment_id}?from=payments`}
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3.5 transition-colors hover:bg-accent-soft sm:flex-nowrap sm:px-5"
                >
                  <span className="min-w-0 flex-1 basis-full sm:basis-auto">
                    <span className="block truncate font-semibold text-ink">
                      {p.job_title ?? 'Booking'}
                    </span>
                    <span className="block truncate text-xs text-ink-50">
                      {p.provider_name ?? ''} · {dateTime(p.paid_at ?? p.created_at)}
                    </span>

                    <span className="mt-1 flex flex-wrap items-center gap-1.5">
                      {p.kind === 'fee' ? (
                        <span className="rounded bg-surface-muted px-1.5 py-px text-[0.65rem] font-semibold text-ink-70">
                          Subscription
                        </span>
                      ) : p.is_cash_payment ? (
                        <span className="rounded bg-warm px-1.5 py-px text-[0.65rem] font-semibold text-[#9a5b25]">
                          Cash
                        </span>
                      ) : (
                        <span className="rounded bg-accent-soft px-1.5 py-px text-[0.65rem] font-semibold text-accent-role">
                          Through the platform
                        </span>
                      )}
                      {p.is_recurring && (
                        <span className="rounded bg-[#e6f1f8] px-1.5 py-px text-[0.65rem] font-semibold text-secondary">
                          Recurring
                        </span>
                      )}
                      <span className="text-xs text-ink-50">
                        {p.kind === 'fee'
                          ? 'Monthly subscription, charged by HelpersHob'
                          : p.is_cash_payment
                            ? 'Paid directly to the provider'
                            : 'Paid through the platform'}
                      </span>
                    </span>
                  </span>

                  <Badge value={p.payment_status} />
                  <span className="ml-auto shrink-0 text-right font-bold tabular-nums text-ink sm:ml-0">
                    {money(p.total_amount, p.currency ?? 'EUR')}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
