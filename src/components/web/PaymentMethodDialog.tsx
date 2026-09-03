'use client'

import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/web/api'
import { Button, Spinner, money } from './ui'
import { useT } from '@/lib/i18n'

export interface SavedCard {
  id: string
  cardLabel?: string | null
  cardNumber?: string | null
  exp_month?: number | null
  exp_year?: number | null
  is_default?: boolean | null
}

export interface Breakdown {
  service?: number
  fee?: number
  stripeFee?: number
  token?: number
  cash?: number
  total: number
}

/**
 * Choose how to pay, mirroring the mobile PaymentMethodSelector.
 *
 * `onSelect` is handed the saved card's id, or undefined for "a new card" —
 * the same signature the mobile sheet uses, because the API branches on whether
 * an id was sent rather than on which card it names.
 */
export default function PaymentMethodDialog({
  open,
  title,
  breakdown,
  busy,
  onClose,
  onSelect,
}: {
  open: boolean
  title: string
  breakdown: Breakdown
  busy?: boolean
  onClose: () => void
  onSelect: (cardId?: string) => void | Promise<void>
}) {
  const t = useT()
  const [cards, setCards] = useState<SavedCard[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const res = await api.get<{ methods?: SavedCard[] }>('/payments/methods')
    setCards(res.success && Array.isArray(res.data?.methods) ? res.data.methods : [])
    setLoading(false)
  }, [])

  // Deferred a tick so the state change lands outside the effect body, and
  // cancelled on close so a slow response cannot fill a dialog that is gone.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    const t = setTimeout(() => {
      if (cancelled) return
      setLoading(true)
      void load()
    }, 0)
    return () => { cancelled = true; clearTimeout(t) }
  }, [open, load])

  if (!open) return null

  const rows: [string, number | undefined][] = [
    ['Service', breakdown.service],
    ['Service fee', breakdown.fee],
    ['Card processing', breakdown.stripeFee],
    ['Monthly subscription', breakdown.token],
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4"
      role="dialog" aria-modal="true">
      <div className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-surface p-5 shadow-xl sm:rounded-2xl">
        <h2 className="text-lg font-bold tracking-tight text-ink">{title}</h2>

        <dl className="mt-4 space-y-2 border-y border-line-soft py-3 text-sm">
          {rows.map(([label, value]) =>
            !value ? null : (
              <div key={label} className="flex justify-between">
                <dt className="text-ink-70">{label}</dt>
                <dd className="font-medium tabular-nums">{money(value)}</dd>
              </div>
            ),
          )}
          <div className="flex justify-between pt-1 text-base">
            <dt className="font-semibold text-ink">{t('ui.chargedNow')}</dt>
            <dd className="font-bold tabular-nums text-accent-role">{money(breakdown.total)}</dd>
          </div>
          {!!breakdown.cash && (
            <p className="rounded-lg bg-warm px-3 py-2 text-xs font-medium text-[#9a5b25]">
              Then pay {money(breakdown.cash)} in cash directly to the provider.
            </p>
          )}
        </dl>

        {loading ? <Spinner /> : (
          <div className="mt-4 space-y-2">
            {cards.map((c) => (
              <button key={c.id} disabled={busy} onClick={() => void onSelect(c.id)}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-line px-4 py-3 text-left transition-colors hover:border-accent-role hover:bg-accent-soft disabled:opacity-50">
                <span className="min-w-0">
                  <span className="block font-semibold capitalize text-ink">
                    {c.cardLabel ?? t('ui.card')} ···· {c.cardNumber ?? '••••'}
                  </span>
                  {c.exp_month && c.exp_year && (
                    <span className="block text-xs text-ink-50">
                      Expires {String(c.exp_month).padStart(2, '0')}/{String(c.exp_year).slice(-2)}
                    </span>
                  )}
                </span>
                {c.is_default && (
                  <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-ink">
                    default
                  </span>
                )}
              </button>
            ))}

            <Button variant="outline" fullWidth disabled={busy} onClick={() => void onSelect(undefined)}>
              {cards.length > 0 ? t('ui.payWithANewCard') : t('ui.continueToPayment')}
            </Button>
            <Button variant="ghost" fullWidth disabled={busy} onClick={onClose}>{t('ui.cancel')}</Button>
          </div>
        )}
      </div>
    </div>
  )
}
