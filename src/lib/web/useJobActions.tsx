'use client'

import { useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'

import { api } from './api'
import ConfirmDialog from '@/components/web/ConfirmDialog'
import PaymentMethodDialog from '@/components/web/PaymentMethodDialog'
import { money } from '@/components/web/ui'
import { useT } from '@/lib/i18n'

/** The fields every completion decision reads. */
export interface ActionableOffer {
  offer_id: string
  offer_status: string
  pay_through_platform?: boolean | null
  is_recurring?: boolean | null
  service_date?: string | null
  service_time?: string | null
  payment_amount?: string | number | null
  currency?: string | null
}

/** Start Now → Mark as Arrived → Mark Complete, as the mobile card labels them. */
export function primaryAction(status: string): [label: string, action: string] | null {
  if (status === 'scheduled') return ['Start Now', 'start']
  if (status === 'pending') return ['Mark as Arrived', 'mark-awaiting']
  if (status === 'active') return ['Mark Complete', 'mark-complete-provider']
  return null
}

/**
 * A job may be started from an hour before its slot onwards — never earlier,
 * however late it runs. Same window as the mobile canStartJob.
 */
export function canStart(offer: ActionableOffer): boolean {
  if (!offer.service_date || !offer.service_time) return false
  const at = new Date(`${offer.service_date}T${offer.service_time}`)
  if (Number.isNaN(at.getTime())) return true
  return Date.now() >= at.getTime() - 60 * 60 * 1000
}

interface Confirm {
  title: string
  body: string
  cta: string
  tone?: 'accent' | 'danger'
  run: () => Promise<void>
}

/**
 * The job lifecycle actions and every gate the mobile app puts in front of
 * them, in one place so the detail screen and the list cards cannot drift.
 *
 * The gates are not decoration: a platform-paid job cannot complete until
 * Stripe can pay the provider, and a recurring job of either kind cannot
 * complete until that month's subscription is settled.
 */
export function useJobActions(refresh: () => Promise<void>) {
  const t = useT()
  const router = useRouter()

  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  // Provider's EUR 5 month token, owed before a recurring job can complete.
  const [providerToken, setProviderToken] = useState<string | null>(null)
  // Customer's EUR 15 month token, owed before a recurring cash job can close.
  const [customerToken, setCustomerToken] = useState<ActionableOffer | null>(null)

  async function post(offerId: string, action: string, extra?: Record<string, unknown>) {
    setBusyId(offerId)
    setError(null)
    const res = await api.post<{ token_required?: boolean }>(
      `/offers/${offerId}`, { action, ...extra },
    )
    if (!res.success) {
      // Not a failure to report — the provider just owes this month's token.
      if (res.data?.token_required) {
        setProviderToken(offerId)
        setBusyId(null)
        return false
      }
      setError(res.error ?? t('jobs.couldNotUpdateThisJob'))
      setBusyId(null)
      return false
    }
    await refresh()
    setBusyId(null)
    return true
  }

  /** Provider: Start Now / Mark as Arrived / Mark Complete. */
  async function providerPrimary(offer: ActionableOffer) {
    const next = primaryAction(offer.offer_status)
    if (!next) return
    const action = next[1]

    if (action === 'start') {
      if (!canStart(offer)) {
        setError(t('jobs.thisJobCanOnlyBeStarted'))
        return
      }
      await post(offer.offer_id, 'start')
      return
    }

    if (action === 'mark-awaiting') {
      await post(offer.offer_id, 'mark-awaiting')
      return
    }

    // Mark Complete — a platform-paid job needs a working payout account first.
    setError(null)
    if (offer.pay_through_platform !== false) {
      setBusyId(offer.offer_id)
      const s = await api.get<{ connected?: boolean; can_receive_payments?: boolean }>(
        '/providers/stripe-status',
      )
      setBusyId(null)
      if (!s.success) { setError(s.error ?? t('jobs.couldNotVerifyYourPaymentAccount')); return }

      if (!s.data?.connected) {
        setConfirm({
          title: t('jobs.bankDetailsRequired'),
          body: t('jobs.addYourBankAccountToReceive'),
          cta: t('jobs.addBankDetails'),
          run: async () => { router.push('/provider/payouts') },
        })
        return
      }
      if (!s.data.can_receive_payments) {
        setConfirm({
          title: t('jobs.completeStripeVerification'),
          body: t('jobs.yourStripeAccountNeedsVerificationBefore'),
          cta: t('jobs.completeVerification'),
          run: async () => { router.push('/provider/payouts') },
        })
        return
      }
    }

    setConfirm({
      title: t('jobs.confirmCompletion'),
      body: offer.pay_through_platform !== false
        ? t('common.markThisJobAsCompletedThe')
        : t('common.markThisJobAsCompletedThe2'),
      cta: t('jobs.markCompleted'),
      run: async () => { await post(offer.offer_id, 'mark-complete-provider') },
    })
  }

  /** Pay the provider's month token, then finish the completion it blocked. */
  async function payProviderToken(offerId: string, cardId?: string) {
    setBusyId(offerId)
    setError(null)
    const res = await api.post<{ checkoutUrl?: string }>(
      '/payments/provider-token', { offer_id: offerId, payment_method_id: cardId },
    )
    if (!res.success) {
      setError(res.error ?? t('jobs.couldNotChargeTheMonthlyToken'))
      setBusyId(null)
      return
    }
    // A new card leaves for Stripe and returns through /payment.
    if (res.data?.checkoutUrl) { window.location.href = res.data.checkoutUrl; return }

    setProviderToken(null)
    await post(offerId, 'mark-complete-provider')
  }

  /**
   * Customer: close out a cash job. Nothing is charged for the work itself, but
   * a recurring one still owes this month's subscription.
   */
  async function customerCompleteCash(offer: ActionableOffer) {
    setError(null)
    const cash = money(offer.payment_amount, offer.currency ?? 'EUR')

    if (!offer.is_recurring) {
      setConfirm({
        title: t('jobs.completeJob'),
        body: `Pay ${cash} in cash to the provider.`,
        cta: t('jobs.markComplete'),
        run: async () => { await post(offer.offer_id, 'complete') },
      })
      return
    }

    setBusyId(offer.offer_id)
    const res = await api.post<{ customer_token?: { status?: string } }>(
      '/payments/create', { offer_id: offer.offer_id },
    )
    setBusyId(null)
    if (!res.success) { setError(res.error ?? t('jobs.couldNotCheckTheSubscription')); return }

    if (res.data?.customer_token?.status === 'already_paid') {
      setConfirm({
        title: t('jobs.completeJob'),
        body: `Pay ${cash} in cash to the provider.\n\nThis month's subscription is already paid.`,
        cta: t('jobs.markComplete'),
        run: async () => { await post(offer.offer_id, 'complete') },
      })
      return
    }
    setCustomerToken(offer)
  }

  /** Charge the customer's subscription, then close the cash job. */
  async function payCustomerToken(offer: ActionableOffer, cardId?: string) {
    setBusyId(offer.offer_id)
    setError(null)
    const res = await api.post<{ checkoutUrl?: string }>(
      '/payments/customer-token', { offer_id: offer.offer_id, payment_method_id: cardId },
    )
    if (!res.success) {
      setError(res.error ?? t('jobs.couldNotChargeTheSubscription'))
      setBusyId(null)
      return
    }
    if (res.data?.checkoutUrl) { window.location.href = res.data.checkoutUrl; return }

    setCustomerToken(null)
    await post(offer.offer_id, 'complete')
  }

  function askNotCompleted(offerId: string) {
    setConfirm({
      title: t('jobs.markNotCompleted'),
      body: t('jobs.markThisJobAsNotCompleted'),
      cta: t('jobs.notCompleted'),
      tone: 'danger',
      run: async () => { await post(offerId, 'mark-not-completed') },
    })
  }

  const dialogs: ReactNode = (
    <>
      <ConfirmDialog
        open={confirm !== null}
        busy={busyId !== null}
        title={confirm?.title ?? ''}
        body={confirm?.body ?? ''}
        cta={confirm?.cta ?? t('common.confirm')}
        tone={confirm?.tone}
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          const c = confirm
          setConfirm(null)
          await c?.run()
        }}
      />

      <PaymentMethodDialog
        open={providerToken !== null}
        busy={busyId !== null}
        title={t('jobs.monthlySubscriptionDue')}
        breakdown={{ token: 5, total: 5 }}
        onClose={() => setProviderToken(null)}
        onSelect={(cardId) => { if (providerToken) void payProviderToken(providerToken, cardId) }}
      />

      <PaymentMethodDialog
        open={customerToken !== null}
        busy={busyId !== null}
        title={t('jobs.monthlySubscriptionDue')}
        breakdown={{
          token: 15,
          total: 15,
          cash: customerToken
            ? parseFloat(String(customerToken.payment_amount)) || undefined
            : undefined,
        }}
        onClose={() => setCustomerToken(null)}
        onSelect={(cardId) => { if (customerToken) void payCustomerToken(customerToken, cardId) }}
      />
    </>
  )

  return {
    busyId, error, setError,
    post, providerPrimary, customerCompleteCash, askNotCompleted,
    dialogs,
  }
}
