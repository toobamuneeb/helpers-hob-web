'use client'

import { use, useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/web/api'
import PaymentMethodDialog from '@/components/web/PaymentMethodDialog'
import { BackLink, Button, Card, ErrorNote, PageTitle, Spinner, money } from '@/components/web/ui'
import { useT } from '@/lib/i18n'

/** /api/payments/preview answers at the root, not under `data`. */
interface Preview {
  service_amount?: number
  platform_fee?: number
  stripe_fee?: number
  monthly_token?: number
  subtotal?: number
  total?: number
  is_recurring?: boolean
  pay_through_platform?: boolean
}

/** /api/payments/create, likewise at the root. */
interface CreateResult {
  checkout_url?: string
  payment_id?: string
  instant?: boolean
  already_paid?: boolean
  saved_card_used?: boolean
  status?: string
  cash_amount?: number
  message?: string
  customer_token?: { status?: string; paymentId?: string }
  breakdown?: { cash_amount?: number; provider_payout?: number; total_amount?: number }
}

/**
 * Confirm & pay for a completed job — the web counterpart of the mobile
 * usePayment.confirmAndPay.
 *
 * All the fee maths is the server's; this screen only shows what it returns and
 * routes the four outcomes: hosted checkout, a saved card charged off-session,
 * a cash job where only the subscription is charged, and an already-paid job.
 */
export default function PayPage({ params }: { params: Promise<{ offerId: string }> }) {
  const { offerId } = use(params)
  const t = useT()
  const router = useRouter()

  const [preview, setPreview] = useState<Preview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [chooser, setChooser] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const load = useCallback(async () => {
    // /payments/preview prices a job from its numbers, not from an offer id —
    // it reads amount, isRecurring and payThroughPlatform off the query string
    // and answers "Invalid amount" to anything else. That is the same call the
    // mobile app makes; the offer has to be fetched first to fill it in.
    const offer = await api.get<{
      payment_amount?: number
      is_recurring?: boolean
      pay_through_platform?: boolean
    }>(`/offers/${offerId}`)

    if (!offer.success || !offer.data) {
      setError(offer.error ?? t('payments.couldNotLoadThisJob'))
      setLoading(false)
      return
    }

    const amount = Number(offer.data.payment_amount ?? 0)
    if (!amount) {
      setError(t('payments.thisJobHasNoAmountTo'))
      setLoading(false)
      return
    }

    const res = await api.get<Preview>(
      `/payments/preview${api.qs({
        amount,
        isRecurring: offer.data.is_recurring === true,
        // Only an explicit false means cash; anything else is the platform.
        payThroughPlatform: offer.data.pay_through_platform !== false,
      })}`,
    )
    if (res.success && res.data) { setPreview(res.data); setError(null) }
    else setError(res.error ?? t('payments.couldNotLoadThePaymentDetails'))
    setLoading(false)
  }, [offerId])

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(() => { if (!cancelled) void load() }, 0)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [load])

  const cashOnly = preview?.pay_through_platform === false
  const total = preview?.total ?? 0

  /** Charge the €15 subscription on its own — the cash-recurring path. */
  async function payToken(cardId?: string) {
    const res = await api.post<{ status?: string; checkoutUrl?: string }>(
      '/payments/customer-token', { offer_id: offerId, payment_method_id: cardId },
    )
    if (!res.success) { setError(res.error ?? t('payments.couldNotChargeTheSubscription')); return false }
    if (res.data?.checkoutUrl) { window.location.href = res.data.checkoutUrl; return true }
    return true
  }

  async function pay(cardId?: string) {
    setBusy(true)
    setError(null)

    // The API reads "no card id" as "take me to checkout for a new card", so the
    // key must be absent rather than undefined-valued.
    const res = await api.post<CreateResult>('/payments/create',
      cardId ? { offer_id: offerId, mandate_id: cardId } : { offer_id: offerId })

    // A second attempt on a paid booking is a success, not an error.
    if (res.status === 409 || res.error?.includes('already')) {
      setChooser(false)
      router.replace(`/jobs/${offerId}`)
      return
    }
    if (!res.success) {
      setError(res.error ?? t('payments.couldNotStartThePayment'))
      setBusy(false)
      return
    }

    const d = res.data ?? {}

    // Hosted Stripe Checkout.
    if (d.checkout_url) { window.location.href = d.checkout_url; return }

    // Cash + recurring: nothing to charge for the job itself, only the monthly
    // subscription — and only if this month's is not already paid.
    if (d.customer_token) {
      if (d.customer_token.status === 'already_paid') {
        setChooser(false)
        setBusy(false)
        setNote(d.message ?? t('payments.thisMonthSSubscriptionIsAlready'))
        return
      }
      const went = await payToken(cardId)
      if (!went) setBusy(false)
      return
    }

    // Charged off-session against a saved card, or already settled.
    if (d.instant || d.already_paid || d.saved_card_used) {
      setChooser(false)
      window.location.href = `/payment/success?offer_id=${offerId}`
      return
    }

    // A charge is already in flight for this booking — never start a second one.
    if (d.status === 'processing') {
      setChooser(false)
      setBusy(false)
      setNote('A payment for this booking is already being processed.')
      return
    }

    setError(t('payments.thePaymentCouldNotBeStarted'))
    setBusy(false)
  }

  if (loading) return <Spinner />

  const rows: [string, number | undefined][] = [
    ['Service', preview?.service_amount],
    ['Service fee', preview?.platform_fee],
    ['Card processing', preview?.stripe_fee],
    ['Monthly subscription', preview?.monthly_token],
  ]

  return (
    <div className="space-y-5">
      <BackLink href={`/jobs/${offerId}`}>{t('payments.backToBooking')}</BackLink>
      <PageTitle title={t('payments.confirmAmpPay')}
        sub={cashOnly
          ? t('payments.theServiceIsPaidInCash')
          : t('payments.payingReleasesTheJobToThe')} />
      {error && <ErrorNote>{error}</ErrorNote>}
      {note && (
        <p className="rounded-xl border border-[#e8c3a4] bg-warm px-4 py-3 text-sm font-medium text-[#9a5b25]">
          {note}
        </p>
      )}

      <Card title={t('payments.summary')}>
        <dl className="space-y-2 text-sm">
          {rows.map(([label, value]) =>
            !value ? null : (
              <div key={label} className="flex justify-between">
                <dt className="text-ink-70">{label}</dt>
                <dd className="font-medium tabular-nums">{money(value)}</dd>
              </div>
            ),
          )}
          <div className="flex justify-between border-t border-line-soft pt-2 text-base">
            <dt className="font-semibold text-ink">{t('payments.total')}</dt>
            <dd className="font-bold tabular-nums text-accent-role">{money(total)}</dd>
          </div>
        </dl>

        {cashOnly && !!preview?.service_amount && (
          <p className="mt-4 rounded-lg bg-warm px-3 py-2 text-xs font-medium text-[#9a5b25]">
            Pay {money(preview.service_amount)} in cash directly to the provider.
          </p>
        )}

        <Button size="lg" fullWidth className="mt-5" loading={busy} onClick={() => setChooser(true)}>
          Pay {money(total)}
        </Button>
      </Card>

      <PaymentMethodDialog
        open={chooser}
        busy={busy}
        title={t('payments.howWouldYouLikeToPay')}
        breakdown={{
          service: preview?.service_amount,
          fee: preview?.platform_fee,
          stripeFee: preview?.stripe_fee,
          token: preview?.monthly_token,
          cash: cashOnly ? preview?.service_amount : undefined,
          total,
        }}
        onClose={() => setChooser(false)}
        onSelect={(cardId) => pay(cardId)}
      />
    </div>
  )
}
