'use client'

import { useState } from 'react'
import type { DayOfWeek } from '@/types/availability'
import { useT } from '@/lib/i18n'

export interface Slot {
  day_of_week: DayOfWeek
  start_time: string
  end_time: string
}

const DAYS: { id: DayOfWeek; labelKey: string }[] = [
  { id: 'monday', labelKey: 'ui.monday' },
  { id: 'tuesday', labelKey: 'ui.tuesday' },
  { id: 'wednesday', labelKey: 'ui.wednesday' },
  { id: 'thursday', labelKey: 'ui.thursday' },
  { id: 'friday', labelKey: 'ui.friday' },
  { id: 'saturday', labelKey: 'ui.saturday' },
  { id: 'sunday', labelKey: 'ui.sunday' },
]

/**
 * Weekly availability, mirroring the mobile AvailabilityManager: multiple time
 * slots per day, all seven days, "HH:MM" 24-hour values as the API expects.
 */
export default function AvailabilityPicker({
  slots,
  onChange,
}: {
  slots: Slot[]
  onChange: (slots: Slot[]) => void
}) {
  const t = useT()
  const [open, setOpen] = useState<DayOfWeek | null>(null)

  const forDay = (day: DayOfWeek) => slots.filter((s) => s.day_of_week === day)

  function addSlot(day: DayOfWeek) {
    onChange([...slots, { day_of_week: day, start_time: '09:00', end_time: '17:00' }])
    setOpen(day)
  }

  function update(index: number, patch: Partial<Slot>) {
    onChange(slots.map((s, i) => (i === index ? { ...s, ...patch } : s)))
  }

  function remove(index: number) {
    onChange(slots.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-2">
      {DAYS.map((day) => {
        const daySlots = forDay(day.id)
        const isOpen = open === day.id || daySlots.length > 0

        return (
          <div key={day.id} className="rounded-lg border border-line bg-surface">
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-sm font-semibold text-ink">{t(day.labelKey)}</span>
              {daySlots.length === 0 ? (
                <button
                  type="button"
                  onClick={() => addSlot(day.id)}
                  className="text-sm font-semibold text-accent-role hover:underline"
                >
                  + Add hours
                </button>
              ) : (
                <span className="text-xs text-ink-50">
                  {daySlots.length} {daySlots.length === 1 ? 'slot' : 'slots'}
                </span>
              )}
            </div>

            {isOpen && daySlots.length > 0 && (
              <div className="space-y-2 border-t border-line-soft px-4 py-3">
                {slots.map((slot, index) =>
                  slot.day_of_week !== day.id ? null : (
                    <div key={index} className="flex flex-wrap items-center gap-2">
                      <input
                        type="time"
                        value={slot.start_time}
                        onChange={(e) => update(index, { start_time: e.target.value })}
                        className="min-w-0 flex-1 rounded-lg border border-line px-2.5 py-2 text-sm outline-none focus:border-accent-role xs:flex-none"
                      />
                      <span className="text-ink-50">to</span>
                      <input
                        type="time"
                        value={slot.end_time}
                        onChange={(e) => update(index, { end_time: e.target.value })}
                        className="rounded-lg border border-line px-2.5 py-1.5 text-sm outline-none focus:border-accent-role"
                      />
                      <button
                        type="button"
                        onClick={() => remove(index)}
                        className="ml-auto text-xs font-semibold text-danger hover:underline"
                      >
                        {t('ui.remove')}
                      </button>
                    </div>
                  ),
                )}
                <button
                  type="button"
                  onClick={() => addSlot(day.id)}
                  className="text-sm font-semibold text-accent-role hover:underline"
                >
                  + Add another
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** The API rejects a slot whose end is not after its start. */
/**
 * Put times into the HH:MM the API insists on.
 *
 * Postgres hands a `time` column back as HH:MM:SS, and POST /providers/
 * availability validates strictly against HH:MM — so hours read from the server
 * and saved again unchanged came back as "Time must be in HH:MM format". The
 * mobile AvailabilityManager solves it the same way, taking the first two parts
 * and padding each: seconds are dropped and 9:00 becomes 09:00.
 */
export function normaliseSlots(slots: Slot[]): Slot[] {
  const toHHMM = (time: string): string => {
    const [hours = '', minutes = ''] = (time ?? '').split(':')
    if (!hours || !minutes) return time
    return `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`
  }
  return slots.map((s) => ({
    ...s,
    start_time: toHHMM(s.start_time),
    end_time: toHHMM(s.end_time),
  }))
}

export function validateSlots(slots: Slot[]): string | null {
  if (slots.length === 0) return 'Add at least one time slot'
  for (const s of slots) {
    if (s.start_time >= s.end_time) {
      return `${s.day_of_week}: end time must be after start time`
    }
  }
  return null
}

export { DAYS }
