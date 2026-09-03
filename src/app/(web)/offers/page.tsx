'use client'

import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/web/api'
import { useSession } from '@/lib/web/session'
import BookingCard, { type OfferLike } from '@/components/web/BookingCard'
import { Badge, Button, Card, Empty, ErrorNote, PageTitle, CardSkeleton } from '@/components/web/ui'
import { useT } from '@/lib/i18n'

/**
 * The reply an offer has had, which is what this screen is about — distinct
 * from offer_status, which tracks the work. Wording from the mobile Offers
 * screen's JOB_STATUS_LABELS.
 */
const REPLY_LABEL_KEY: Record<string, string> = {
  pending: 'offers.awaitingResponse',
  accepted: 'offers.accepted',
  rejected: 'offers.rejected',
  canceled: 'offers.cancelled',
  cancelled: 'offers.cancelled',
}

/**
 * Pending offers.
 *
 * Providers act on the ones waiting for them. Customers see every offer they
 * have sent, whatever came of it, tagged with the reply — the mobile screen
 * deliberately keeps rejected and cancelled ones visible here.
 */
export default function OffersPage() {
  const { isProvider } = useSession()
  const t = useT()
  const [offers, setOffers] = useState<OfferLike[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await api.get<OfferLike[]>(
      isProvider ? '/offers/pending?limit=50' : '/offers?limit=100',
    )
    if (res.success) { setOffers(Array.isArray(res.data) ? res.data : []); setError(null) }
    else setError(res.error ?? t('offers.couldNotLoadOffers'))
    setLoading(false)
  }, [isProvider])

  // Deferred by a tick so the fetch's setState lands outside the effect body,
  // and cancelled on unmount so a slow response cannot set state on a page the
  // user has already left.
  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(() => { if (!cancelled) void load() }, 0)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [load])

  async function act(offerId: string, action: 'accept' | 'reject' | 'cancel', confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return
    setBusyId(offerId)
    const res = await api.post(`/offers/${offerId}`, { action })
    if (!res.success) setError(res.error ?? t('offers.couldNotUpdateTheOffer'))
    else await load()
    setBusyId(null)
  }

  function cardFor(o: OfferLike) {
    if (isProvider) {
      return (
        <BookingCard key={o.offer_id} offer={o} role="service_provider"
          href={`/jobs/${o.offer_id}?from=offers`}
          // get_pending_offers_for_provider returns offer_job_status, not
          // offer_status — every row here is an offer waiting on this provider.
          badge={<Badge value={o.offer_job_status ?? 'pending'} label={t('offers.awaitingYourReply')} />}
          actions={
            <>
              <Button size="sm" loading={busyId === o.offer_id}
                onClick={() => act(o.offer_id, 'accept')}>{t('offers.accept')}</Button>
              <Button size="sm" variant="outline" disabled={busyId === o.offer_id}
                onClick={() => act(o.offer_id, 'reject', 'Decline this offer?')}>{t('offers.decline')}</Button>
            </>
          } />
      )
    }

    const reply = o.offer_job_status ?? 'pending'
    return (
      <BookingCard key={o.offer_id} offer={o} role="customer"
        href={`/jobs/${o.offer_id}?from=offers`}
        badge={<Badge value={reply} label={REPLY_LABEL_KEY[reply] ? t(REPLY_LABEL_KEY[reply]) : reply} />}
        // Only an offer still waiting for a reply can be withdrawn; once it has
        // been accepted it is a booking, and once rejected there is nothing left
        // to cancel.
        actions={reply === 'pending' ? (
          <Button size="sm" variant="outline" loading={busyId === o.offer_id}
            onClick={() => act(o.offer_id, 'cancel', 'Cancel this offer?')}>{t('offers.cancelOffer')}</Button>
        ) : undefined} />
    )
  }

  return (
    <div className="space-y-5">
      <PageTitle
        title={isProvider ? t('offers.pendingOffers') : t('offers.mySentOffers')}
        sub={isProvider
          ? t('offers.customersWhoWantToBookYou')
          : t('offers.everyOfferYouHaveSent')}
      />

      {error && <ErrorNote>{error}</ErrorNote>}

      {loading ? <CardSkeleton /> : offers.length === 0 ? (
        <Card><Empty title={isProvider ? t('offers.nothingPending') : t('offers.noSentOffers')}
          sub={isProvider ? t('offers.newOffersWillAppearHere') : t('offers.offersYouSendWillAppearHere')} /></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {offers.map(cardFor)}
        </div>
      )}
    </div>
  )
}
