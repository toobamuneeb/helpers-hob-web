'use client'

import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/web/api'
import { BackLink, Button, Card, Empty, ErrorNote, PageTitle, Spinner } from '@/components/web/ui'

interface Method {
  id?: string
  mandate_id?: string
  brand?: string | null
  last4?: string | null
  exp_month?: number | null
  exp_year?: number | null
  is_default?: boolean | null
}

const idOf = (m: Method) => m.id ?? m.mandate_id ?? ''

export default function PaymentMethodsPage() {
  const [methods, setMethods] = useState<Method[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const res = await api.get<Method[] | { methods?: Method[] }>('/payments/methods')
    if (res.success && res.data) {
      const raw = res.data as Method[] | { methods?: Method[] }
      setMethods(Array.isArray(raw) ? raw : (raw.methods ?? []))
      setError(null)
    } else setError(res.error ?? 'Could not load your cards')
    setLoading(false)
  }, [])

  // Deferred by a tick so the fetch's setState lands outside the effect body,
  // and cancelled on unmount so a slow response cannot set state on a page the
  // user has already left.
  useEffect(() => {
    let cancelled = false
    const t = setTimeout(() => { if (!cancelled) void load() }, 0)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [load])

  async function addCard() {
    setBusy(true)
    const res = await api.post<{ url?: string; checkout_url?: string }>('/payments/add-card', {})
    const url = res.data?.url ?? res.data?.checkout_url
    if (res.success && url) window.location.href = url
    else { setError(res.error ?? 'Could not start card setup'); setBusy(false) }
  }

  async function remove(id: string) {
    if (!window.confirm('Remove this card?')) return
    setBusy(true)
    const res = await api.del(`/payments/methods/${id}`)
    if (!res.success) setError(res.error ?? 'Could not remove the card')
    else await load()
    setBusy(false)
  }

  return (
    <div className="space-y-5">
      <BackLink href="/profile">Back to profile</BackLink>
      <PageTitle title="Payment methods" sub="Cards used for bookings and subscriptions." />
      {error && <ErrorNote>{error}</ErrorNote>}

      <Card>
        {loading ? <Spinner /> : methods.length === 0 ? (
          <Empty title="No cards saved"
            sub="Add a card to pay for bookings without re-entering details."
            action={<Button onClick={addCard} loading={busy}>Add a card</Button>} />
        ) : (
          <>
            <ul className="divide-y divide-line-soft">
              {methods.map((m) => (
                <li key={idOf(m)} className="flex flex-wrap items-center justify-between gap-3 py-3.5 first:pt-0">
                  <span>
                    <span className="block font-semibold capitalize text-ink">
                      {m.brand ?? 'Card'} •••• {m.last4 ?? '____'}
                    </span>
                    {m.exp_month && m.exp_year && (
                      <span className="block text-xs text-ink-50">
                        Expires {String(m.exp_month).padStart(2, '0')}/{m.exp_year}
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-2">
                    {m.is_default && (
                      <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-ink">
                        default
                      </span>
                    )}
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => remove(idOf(m))}>
                      Remove
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-4">
              <Button variant="outline" onClick={addCard} loading={busy}>Add another card</Button>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}
