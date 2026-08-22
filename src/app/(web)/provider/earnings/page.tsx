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
      const [e, h] = await Promise.all([
        api.get<Earnings>('/payments/earnings'),
        api.get<{ payments?: Payment[] } | Payment[]>('/payments/history'),
      ])
      if (cancelled) return

      if (e.success && e.data) setSummary(e.data)
      else setError(e.error ?? null)

      if (h.success && h.data) {
        const raw = h.data as { payments?: Payment[] } | Payment[]
        setPayments(Array.isArray(raw) ? raw : (raw.payments ?? []))
      }
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  if (loading) return <Spinner />

  return (
    <div className="space-y-5">
      <PageTitle title="Payment History" sub="Split payment via Stripe — your share after fees." />
      {error && <ErrorNote>{error}</ErrorNote>}

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: 'Total Earned', value: summary?.total_earned },
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
                  href={`/receipts/${p.payment_id}`}
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
                </span>
                <Badge value={p.payment_status} />
                <span className="ml-auto shrink-0 text-right sm:ml-0">
                  <span className="block font-bold tabular-nums text-ink">
                    {money(p.provider_payout ?? p.total_amount, p.currency ?? 'EUR')}
                  </span>
                  {p.platform_fee != null && (
                    <span className="block text-xs text-ink-50">
                      fee {money(p.platform_fee, p.currency ?? 'EUR')}
                    </span>
                  )}
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
