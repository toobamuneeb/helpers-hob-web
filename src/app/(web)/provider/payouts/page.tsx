'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/web/api'
import {
  Badge, Button, Card, Empty, ErrorNote, PageTitle, Spinner, date, money,
} from '@/components/web/ui'

/** Field names as /api/providers/stripe-status actually returns them. */
interface StripeStatus {
  connected?: boolean
  status?: string | null
  stripe_account_id?: string | null
  can_receive_payments?: boolean
  can_receive_settlements?: boolean
  details_submitted?: boolean
  bank_verified?: boolean
  message?: string | null
}

interface Payment {
  payment_id: string
  job_title?: string | null
  provider_payout?: string | number | null
  payment_status?: string | null
  is_paid_out?: boolean | null
  paid_out_at?: string | null
  paid_at?: string | null
  service_date?: string | null
  currency?: string | null
}

interface Earnings {
  total_earned?: number
  pending_amount?: number
  total_jobs?: number
  currency?: string
  payments?: Payment[]
}

/**
 * "Payment Account" — the provider's Stripe connection and money.
 *
 * Mirrors the mobile BankDetails screen: connection state with the right call
 * to action, available vs pending balance, recent payouts, and what connecting
 * actually gets them.
 */
export default function PaymentAccountPage() {
  const [status, setStatus] = useState<StripeStatus | null>(null)
  const [earnings, setEarnings] = useState<Earnings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    let cancelled = false
    const t = setTimeout(() => {
      void (async () => {
        const [s, e] = await Promise.all([
          api.get<StripeStatus>('/providers/stripe-status'),
          api.get<Earnings>('/payments/earnings'),
        ])
        if (cancelled) return
        if (s.success && s.data) setStatus(s.data)
        else setError(s.error ?? 'Could not load your payment account')
        if (e.success && e.data) setEarnings(e.data)
        setLoading(false)
      })()
    }, 0)
    return () => { cancelled = true; clearTimeout(t) }
  }, [])

  async function onboard() {
    setStarting(true)
    setError(null)
    const res = await api.post<{ onboarding_url?: string; url?: string }>('/providers/onboard-stripe', {})
    const url = res.data?.onboarding_url ?? res.data?.url
    if (res.success && url) window.location.href = url
    else { setError(res.error ?? 'Could not start Stripe setup'); setStarting(false) }
  }

  if (loading) return <Spinner />

  // Stripe lets an account take charges before payouts clear, so both flags
  // must be true before the provider is really paid out.
  const ready = !!status?.can_receive_payments && !!status?.can_receive_settlements
  const started = status?.connected === true
  const currency = earnings?.currency ?? 'EUR'
  const payouts = (earnings?.payments ?? []).filter((p) => p.is_paid_out)

  // Three states, three calls to action — same as the mobile screen.
  const cta = ready
    ? { label: 'Reconnect / Change Account', variant: 'outline' as const }
    : started
      ? { label: 'Complete Stripe Setup', variant: 'accent' as const }
      : { label: 'Connect with Stripe', variant: 'accent' as const }

  return (
    <div className="space-y-5">
      <PageTitle title="Payment Account" sub="Where HelpersHob sends your money." />
      {error && <ErrorNote>{error}</ErrorNote>}

      <Card>
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row">
          <div>
            <div className="flex items-center gap-2.5">
              <span className={`flex h-10 w-10 items-center justify-center rounded-full ${
                ready ? 'bg-accent-soft text-accent-role' : 'bg-warm text-[#9a5b25]'}`}>
                <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
                  <path d="M3 10h18M6 15h4M4 6h16a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V7a1 1 0 011-1z"
                    stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <div>
                <p className="font-bold tracking-tight text-ink">
                  {ready ? 'Connected' : started ? 'Setup incomplete' : 'Not Connected'}
                </p>
                <p className="text-sm text-ink-70">
                  {ready
                    ? 'Your payouts are active.'
                    : started
                      ? 'Finish the Stripe steps to start receiving money.'
                      : 'Connect a Stripe account to get paid for your jobs.'}
                </p>
              </div>
            </div>
          </div>
          <Button variant={cta.variant} onClick={onboard} loading={starting}>{cta.label}</Button>
        </div>

        {started && (
          <dl className="mt-5 grid gap-4 border-t border-line-soft pt-5 sm:grid-cols-2 lg:grid-cols-4">
            {([
              ['Charges enabled', status?.can_receive_payments ? 'Yes' : 'No'],
              ['Payouts enabled', status?.can_receive_settlements ? 'Yes' : 'No'],
              ['Details submitted', status?.details_submitted ? 'Yes' : 'No'],
              ['Account', status?.stripe_account_id ?? '—'],
            ] as [string, string][]).map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-50">{k}</dt>
                <dd className="mt-0.5 break-all text-sm font-medium text-ink-80">{v}</dd>
              </div>
            ))}
          </dl>
        )}
      </Card>

      <div className="grid gap-3 xs:grid-cols-2 sm:gap-4 lg:grid-cols-3">
        {([
          ['Available', earnings?.total_earned, 'Ready to withdraw'],
          ['Pending', earnings?.pending_amount, 'Being processed'],
          ['Completed Jobs', earnings?.total_jobs, 'Paid through the platform'],
        ] as [string, number | undefined, string][]).map(([label, value, sub], i) => (
          <div key={label} className="relative overflow-hidden rounded-xl border border-line bg-surface px-5 py-4">
            <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${i === 0 ? 'bg-accent-role' : 'bg-line'}`} />
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-50">{label}</p>
            <p className={`mt-1.5 text-2xl font-bold tabular-nums ${i === 0 ? 'text-accent-role' : 'text-ink'}`}>
              {label === 'Completed Jobs' ? (value ?? 0) : money(value ?? 0, currency)}
            </p>
            <p className="mt-0.5 text-xs text-ink-50">{sub}</p>
          </div>
        ))}
      </div>

      <Card title="Recent Payouts" bleed
        action={<Link href="/provider/earnings" className="text-sm font-semibold text-accent-role hover:underline">Payment History</Link>}>
        {payouts.length === 0 ? (
          <Empty title="No payouts yet"
            sub="Once a customer pays for a completed job, your share is sent to your Stripe account." />
        ) : (
          <ul className="divide-y divide-line-soft">
            {payouts.slice(0, 6).map((p) => (
              <li key={p.payment_id} className="flex items-center gap-3 px-5 py-3.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-ink">{p.job_title ?? 'Job payment'}</span>
                  <span className="block text-xs text-ink-50">
                    {date(p.paid_out_at ?? p.paid_at ?? p.service_date)}
                  </span>
                </span>
                <Badge value={p.payment_status ?? 'paid'} />
                <span className="shrink-0 font-bold tabular-nums text-ink">
                  {money(p.provider_payout, p.currency ?? currency)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="How It Works">
          <ol className="space-y-3 text-sm text-ink-70">
            {[
              'Connect your Stripe account — it takes a few minutes.',
              'Customers pay through the platform when a job is completed.',
              'Your share, after fees, is sent straight to your account.',
            ].map((step, i) => (
              <li key={step} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-accent-role">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </Card>

        <Card title="Benefits">
          <ul className="space-y-2.5 text-sm text-ink-70">
            {[
              'Automatic payouts — no invoicing chase',
              'Automatic receipts & invoices',
              'Secure card handling by Stripe',
              'Clear fee breakdown on every job',
            ].map((b) => (
              <li key={b} className="flex gap-2.5">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-role" />
                {b}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  )
}
