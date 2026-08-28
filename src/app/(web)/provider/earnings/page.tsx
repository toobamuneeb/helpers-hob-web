'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/web/api'
import { Badge, Card, Empty, ErrorNote, PageTitle, Spinner, dateTime, money } from '@/components/web/ui'

interface Payment {
  payment_id: string
  job_title?: string | null
  customer_name?: string | null
  service_amount?: string | number | null
  platform_fee?: string | number | null
  provider_payout?: string | number | null
  total_amount?: string | number | null
  payment_status: string
  currency?: string | null
  paid_at?: string | null
  created_at?: string | null
  is_recurring?: boolean | null
  is_cash_payment?: boolean | null
  cash_amount?: string | number | null
  offer_id?: string | null
  payment_method?: string | null
  /** Which list this came from: work paid to them, or money they paid out. */
  kind?: 'earned' | 'paid'
}

interface CompletedOffer {
  offer_id: string
  offer_title: string | null
  service_date: string | null
  payment_amount: string | number | null
  currency: string | null
  is_recurring: boolean | null
  pay_through_platform: boolean | null
  customer_name: string | null
}

/**
 * Whether this row belongs to a job settled in cash.
 *
 * The two endpoints say it differently: /payments/history sets is_cash_payment,
 * while /payments/earnings only spells it out in payment_method.
 */
function isCash(p: Payment): boolean {
  return p.is_cash_payment === true || p.payment_method === 'Platform Fee + Cash'
}

interface Earnings {
  total_earned?: number
  pending_amount?: number
  total_jobs?: number
  currency?: string
  payments?: Payment[]
}

/** Provider earnings + payment history, mirroring the mobile PaymentHistory. */
export default function ProviderEarningsPage() {
  const [summary, setSummary] = useState<Earnings | null>(null)
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [e, h, o] = await Promise.all([
        api.get<Earnings>('/payments/earnings'),
        api.get<{ payments?: Payment[] } | Payment[]>('/payments/history'),
        // A cash job never becomes a payments row — the money went hand to hand
        // — so neither payments endpoint can produce it, and the provider saw
        // only the EUR 5 subscription against a job they were paid in full for.
        // The completed offers are where that work is recorded.
        api.get<CompletedOffer[]>('/offers?status=completed&limit=100'),
      ])
      if (cancelled) return

      if (e.success && e.data) setSummary(e.data)
      else setError(e.error ?? null)

      // Earnings is filtered on payee_id — the money this provider was paid, so
      // the jobs they completed. History is filtered on payer_id, which for a
      // provider only ever matches their own monthly subscription charges, and
      // is why no completed job appeared under "Completed Jobs".
      //
      // Subscriptions still belong on this screen, so both are shown: the jobs
      // first, then anything paid out of pocket that is not already listed.
      const earned = e.success && Array.isArray(e.data?.payments) ? e.data.payments : []

      const rawHistory = h.success && h.data
        ? (Array.isArray(h.data) ? h.data : (h.data.payments ?? []))
        : []
      const seen = new Set(earned.map((p) => p.payment_id))
      const paidOut = rawHistory.filter((p) => !seen.has(p.payment_id))

      // Cash jobs, shaped like the payment rows they never had.
      const cashJobs: Payment[] = (
        o.success && Array.isArray(o.data) ? o.data : []
      )
        .filter((j) => j.pay_through_platform === false)
        .map((j) => ({
          payment_id: `offer:${j.offer_id}`,
          offer_id: j.offer_id,
          job_title: j.offer_title,
          customer_name: j.customer_name,
          paid_at: j.service_date,
          created_at: j.service_date,
          provider_payout: j.payment_amount,
          total_amount: j.payment_amount,
          cash_amount: j.payment_amount,
          platform_fee: null,
          payment_status: 'paid',
          currency: j.currency,
          is_recurring: j.is_recurring,
          is_cash_payment: true,
        }))

      const rows = [
        ...earned.map((p) => ({ ...p, kind: 'earned' as const })),
        ...cashJobs.map((p) => ({ ...p, kind: 'earned' as const })),
        ...paidOut.map((p) => ({ ...p, kind: 'paid' as const })),
      ]

      // Newest first, whichever list a row came from.
      rows.sort((a, b) => {
        const at = new Date(a.paid_at ?? a.created_at ?? 0).getTime()
        const bt = new Date(b.paid_at ?? b.created_at ?? 0).getTime()
        return bt - at
      })

      setPayments(rows)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  // What the provider collected in cash, which never reached the platform.
  const cashEarned = payments
    .filter((p) => p.kind === 'earned' && isCash(p))
    .reduce((sum, p) => sum + (Number(p.cash_amount ?? p.total_amount) || 0), 0)

  if (loading) return <Spinner />

  return (
    <div className="space-y-5">
      <PageTitle title="Payment History" sub="Split payment via Stripe — your share after fees." />
      {error && <ErrorNote>{error}</ErrorNote>}

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          // /payments/earnings only totals what Stripe routed, so cash work is
          // missing from it — the figure has to include what is listed below.
          { label: 'Total Earned', value: (summary?.total_earned ?? 0) + cashEarned },
          { label: 'Pending', value: summary?.pending_amount },
                  ].map((s) => (
          <div key={s.label} className="rounded-xl border border-line bg-surface px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-50">{s.label}</p>
            <p className="mt-1.5 text-2xl font-bold tabular-nums text-accent-role">
              {money(s.value ?? 0, summary?.currency ?? 'EUR')}
            </p>
          </div>
        ))}
      </div>

      <Card title="Completed Jobs" bleed>
        {payments.length === 0 ? (
          <Empty title="No Payment History" sub="Completed jobs paid through the platform appear here." />
        ) : (
          <ul className="divide-y divide-line-soft">
            {payments.map((p) => (
              <li key={p.payment_id}>
                <Link
                  // A cash job's service money never became a payment, so its
                  // only payments row is the monthly subscription — linking
                  // there showed a EUR 5 subscription in place of the job.
                  // A subscription always has its own payment, so it keeps its
                  // own receipt — the cash slip belongs to the work, not the fee.
                  href={p.kind === 'paid' || !isCash(p) || !p.offer_id
                    ? `/receipts/${p.payment_id}?from=earnings`
                    : `/receipts/job/${p.offer_id}?from=earnings`}
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3.5 transition-colors hover:bg-accent-soft sm:flex-nowrap sm:px-5"
                >
                <span className="min-w-0 flex-1 basis-full sm:basis-auto">
                  <span className="block truncate font-semibold text-ink">
                    {p.job_title ?? 'Job payment'}
                  </span>
                  <span className="block truncate text-xs text-ink-50">
                    {p.customer_name ?? ''} · {dateTime(p.paid_at ?? p.created_at)}
                  </span>
                  {p.is_recurring && (
                    <span className="mt-1 inline-block rounded bg-[#e6f1f8] px-1.5 py-px text-[0.65rem] font-semibold text-secondary">
                      Recurring Job
                    </span>
                  )}
                  {/* Two different things share this list: work that paid the
                      provider, and subscriptions they paid out. On a cash job
                      the service money never reaches the platform, so a payout
                      column read EUR 0.00 against a EUR 50 job. */}
                  <span className="mt-1 flex flex-wrap items-center gap-1.5">
                    {p.kind === 'paid' ? (
                      <span className="rounded bg-surface-muted px-1.5 py-px text-[0.65rem] font-semibold text-ink-70">
                        Subscription
                      </span>
                    ) : isCash(p) ? (
                      <span className="rounded bg-warm px-1.5 py-px text-[0.65rem] font-semibold text-[#9a5b25]">
                        Cash
                      </span>
                    ) : (
                      <span className="rounded bg-accent-soft px-1.5 py-px text-[0.65rem] font-semibold text-accent-role">
                        Through the platform
                      </span>
                    )}
                    <span className="text-xs text-ink-50">
                      {p.kind === 'paid'
                        ? 'Charged to you by HelpersHob'
                        : isCash(p)
                          ? 'Collected directly from the customer'
                          : `Paid out after a ${money(p.platform_fee ?? 0, p.currency ?? 'EUR')} fee`}
                    </span>
                  </span>
                </span>
                <Badge value={p.payment_status} />
                <span className="ml-auto shrink-0 text-right sm:ml-0">
                  <span className={`block font-bold tabular-nums ${
                    p.kind === 'paid' ? 'text-ink-70' : 'text-ink'}`}>
                    {p.kind === 'paid'
                      ? `− ${money(p.total_amount, p.currency ?? 'EUR')}`
                      : isCash(p)
                        ? money(p.cash_amount || p.total_amount, p.currency ?? 'EUR')
                        : money(p.provider_payout ?? p.total_amount, p.currency ?? 'EUR')}
                  </span>

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
