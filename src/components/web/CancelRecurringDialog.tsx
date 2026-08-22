'use client'

import { useState } from 'react'
import { Button } from './ui'

/**
 * Reason for stopping a recurring series.
 *
 * A real dialog rather than window.prompt: the reason is the only context the
 * reviewing admin gets, and a native prompt gives no room to explain what
 * approval actually does.
 */
export default function CancelRecurringDialog({
  open,
  busy,
  onClose,
  onSubmit,
}: {
  open: boolean
  busy?: boolean
  onClose: () => void
  onSubmit: (reason: string) => void | Promise<void>
}) {
  const [reason, setReason] = useState('')
  const [touched, setTouched] = useState(false)

  if (!open) return null

  const trimmed = reason.trim()
  const tooShort = trimmed.length < 10

  function close() {
    setReason('')
    setTouched(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button aria-label="Close" onClick={close} className="absolute inset-0 bg-ink/40" />

      <div className="relative w-full max-w-md rounded-xl border border-line bg-surface p-6 shadow-xl">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#fdecec] text-danger">
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
              <path d="M12 9v4m0 4h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"
                stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <h2 className="text-base font-bold tracking-tight text-ink">Cancel recurring job</h2>
        </div>

        <p className="mt-3 text-sm leading-relaxed text-ink-70">
          Your request goes to HelpersHob for review. Once approved, upcoming jobs
          in this series are canceled — a job already in progress will still go ahead.
        </p>

        <label className="mt-4 block text-sm font-semibold text-ink-80">
          Why do you want to stop it?
        </label>
        <textarea
          rows={4}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={busy}
          maxLength={500}
          placeholder="Tell us briefly why — this helps us review it faster"
          className={`mt-1.5 w-full rounded-lg border bg-surface px-3.5 py-2.5 text-sm text-ink outline-none placeholder:text-ink-50 focus:ring-1 ${
            touched && tooShort ? 'border-danger focus:ring-danger' : 'border-line focus:border-accent-role focus:ring-accent-role'
          }`}
        />
        <p className={`mt-1 text-xs ${touched && tooShort ? 'font-medium text-danger' : 'text-ink-50'}`}>
          {touched && tooShort
            ? 'Please give at least a short reason (10 characters).'
            : `${trimmed.length}/500`}
        </p>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" fullWidth onClick={close} disabled={busy}>Keep it</Button>
          <Button
            variant="danger"
            fullWidth
            loading={busy}
            onClick={() => {
              setTouched(true)
              if (!tooShort) void onSubmit(trimmed)
            }}
          >
            Send request
          </Button>
        </div>
      </div>
    </div>
  )
}
