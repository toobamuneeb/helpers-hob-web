'use client'

// Picks several photos for a job.
//
// Replaces the single ImagePicker on the posting screen. A photo is optional —
// plenty of jobs are easier to describe in words — but people who do have
// pictures usually have more than one angle worth showing.

import { useRef, useState } from 'react'
import { validateImage } from '@/lib/web/storage'
import { useT } from '@/lib/i18n'

export default function MultiImagePicker({
  value,
  onChange,
  label,
  hint,
  max = 5,
  error,
}: {
  value: File[]
  onChange: (files: File[]) => void
  label: string
  hint?: string
  max?: number
  error?: string
}) {
  const t = useT()
  const inputRef = useRef<HTMLInputElement>(null)
  // Object URLs are kept alongside the files so a preview survives reordering
  // and removal without being regenerated on every render.
  const [previews, setPreviews] = useState<string[]>([])
  const [localError, setLocalError] = useState<string | null>(null)

  function add(files: FileList | null) {
    setLocalError(null)
    if (!files?.length) return

    const room = max - value.length
    if (room <= 0) {
      setLocalError(t('jobs.photoLimitReached', { max }))
      return
    }

    const accepted: File[] = []
    for (const file of Array.from(files).slice(0, room)) {
      const problem = validateImage(file)
      if (problem) { setLocalError(problem); continue }
      accepted.push(file)
    }
    if (!accepted.length) return

    onChange([...value, ...accepted])
    setPreviews((p) => [...p, ...accepted.map((f) => URL.createObjectURL(f))])
    if (files.length > room) setLocalError(t('jobs.photoLimitReached', { max }))
  }

  function remove(i: number) {
    URL.revokeObjectURL(previews[i])
    onChange(value.filter((_, n) => n !== i))
    setPreviews((p) => p.filter((_, n) => n !== i))
    setLocalError(null)
  }

  const shown = error ?? localError

  return (
    <div>
      <label className="mb-1.5 block text-sm font-semibold text-ink-80">{label}</label>

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {previews.map((src, i) => (
          <div key={src} className="relative aspect-square overflow-hidden rounded-lg border border-line">
            {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
            <img src={src} alt="" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => remove(i)}
              aria-label={t('ui.remove')}
              className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80"
            >
              <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
            </button>
            {i === 0 && (
              <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                {t('jobs.coverPhoto')}
              </span>
            )}
          </div>
        ))}

        {value.length < max && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className={`flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed transition-colors hover:border-accent-role ${
              shown ? 'border-danger' : 'border-line'
            } bg-surface-muted text-ink-50`}
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <span className="text-xs font-medium">{t('jobs.addPhoto')}</span>
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => { add(e.target.files); e.target.value = '' }}
      />

      {shown ? (
        <p className="mt-1.5 text-xs font-medium text-danger">{shown}</p>
      ) : (
        <p className="mt-1.5 text-xs text-ink-50">
          {hint ?? t('jobs.photosOptional', { max })}
        </p>
      )}
    </div>
  )
}
