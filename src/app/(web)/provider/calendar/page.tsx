'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/web/api'
import { Badge, Card, Empty, ErrorNote, PageTitle, Spinner, date, money } from '@/components/web/ui'
import { useT } from '@/lib/i18n'

interface CalendarOffer {
  offer_id: string
  offer_title: string | null
  service_description?: string | null
  offer_status: string
  service_date: string
  service_time: string | null
  service_duration?: string | null
  payment_amount: string
  currency?: string | null
  customer_name?: string | null
}

/** Upcoming work grouped by day — the mobile Calendar screen as a list. */
export default function ProviderCalendarPage() {
  const t = useT()
  const [offers, setOffers] = useState<CalendarOffer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const start = new Date()
      const end = new Date()
      end.setMonth(end.getMonth() + 3)

      const res = await api.get<CalendarOffer[]>(
        `/offers/calendar${api.qs({
          start_date: start.toISOString().slice(0, 10),
          end_date: end.toISOString().slice(0, 10),
        })}`,
      )
      if (cancelled) return
      if (res.success) setOffers(Array.isArray(res.data) ? res.data : [])
      else setError(res.error ?? t('calendar.couldNotLoadYourCalendar'))
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  // Group by service day so the list reads like a schedule.
  const groups = offers.reduce<Record<string, CalendarOffer[]>>((acc, o) => {
    const key = o.service_date?.slice(0, 10) ?? 'unknown'
    ;(acc[key] ??= []).push(o)
    return acc
  }, {})
  const days = Object.keys(groups).sort()

  return (
    <div className="space-y-5">
      <PageTitle title={t('calendar.calendar')} sub={t('calendar.yourNextThreeMonths')} />
      {error && <ErrorNote>{error}</ErrorNote>}

      {loading ? <Spinner /> : days.length === 0 ? (
        <Card><Empty title={t('calendar.nothingScheduled')} sub={t('calendar.acceptedJobsWillShowUpHere')} /></Card>
      ) : (
        <div className="space-y-5">
          {days.map((day) => (
            <Card key={day} title={date(day)} bleed>
              <ul className="divide-y divide-line-soft">
                {groups[day].map((o) => (
                  <li key={o.offer_id}>
                    <Link href={`/jobs/${o.offer_id}?from=calendar`}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 transition-colors hover:bg-accent-soft sm:flex-nowrap sm:px-5">
                      <span className="w-14 shrink-0 text-sm font-semibold tabular-nums text-ink-70 sm:w-16">
                        {o.service_time ? new Date(o.service_time).toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' }) : '—'}
                      </span>
                      <span className="min-w-0 flex-1 basis-full sm:basis-auto">
                        <span className="block truncate font-semibold text-ink">
                          {o.offer_title ?? o.service_description ?? t('provider.booking')}
                        </span>
                        <span className="block truncate text-xs text-ink-50">
                          {o.customer_name ?? ''}{o.service_duration ? ` · ${o.service_duration}` : ''}
                        </span>
                      </span>
                      <Badge value={o.offer_status} />
                      <span className="ml-auto shrink-0 text-sm font-bold tabular-nums sm:ml-0">
                        {money(o.payment_amount, o.currency ?? 'EUR')}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
