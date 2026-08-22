'use client'

import type { ReactNode } from 'react'
import { Button } from './ui'

/**
 * The web stand-in for the mobile screens' Alert.alert confirmations, so the
 * same wording and the same two-step commitment survive the port.
 */
export default function ConfirmDialog({
  open,
  title,
  body,
  cta,
  tone = 'accent',
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean
  title: string
  body: ReactNode
  cta: string
  tone?: 'accent' | 'danger'
  busy?: boolean
  onClose: () => void
  onConfirm: () => void | Promise<void>
}) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4"
      role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-t-2xl bg-surface p-5 shadow-xl sm:rounded-2xl">
        <h2 className="text-lg font-bold tracking-tight text-ink">{title}</h2>
        <div className="mt-2 space-y-2 whitespace-pre-line text-sm text-ink-70">{body}</div>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
          <Button variant={tone} fullWidth loading={busy} onClick={() => void onConfirm()}>{cta}</Button>
          <Button variant="ghost" fullWidth disabled={busy} onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  )
}
