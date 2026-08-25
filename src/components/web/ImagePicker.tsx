'use client'

import { useRef, useState } from 'react'
import { validateImage } from '@/lib/web/storage'

/**
 * Click-to-pick image field with a live preview.
 *
 * Replaces the mobile CustomImagePickerModal (camera / gallery sheet) — a web
 * file input already offers both on mobile browsers, so a modal would only add
 * a step.
 */
export default function ImagePicker({
  value,
  onChange,
  label,
  required,
  hint,
  shape = 'circle',
  error,
}: {
  value: File | null
  onChange: (file: File | null) => void
  label: string
  required?: boolean
  hint?: string
  shape?: 'circle' | 'card'
  error?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)

  function pick(file: File | null) {
    setLocalError(null)
    if (!file) {
      onChange(null)
      setPreview(null)
      return
    }
    const problem = validateImage(file)
    if (problem) {
      setLocalError(problem)
      return
    }
    onChange(file)
    setPreview(URL.createObjectURL(file))
  }

  const shown = error ?? localError
  const isCircle = shape === 'circle'

  return (
    <div>
      <label className="mb-1.5 block text-sm font-semibold text-ink-80">
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </label>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={`relative flex items-center justify-center overflow-hidden border-2 border-dashed transition-colors hover:border-accent-role ${
          isCircle ? 'h-28 w-28 rounded-full' : 'h-36 w-full rounded-lg'
        } ${shown ? 'border-danger' : 'border-line'} bg-surface-muted`}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- local blob preview
          <img src={preview} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex flex-col items-center gap-1 px-3 text-center text-ink-50">
            <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
              <path
                d="M12 16V4m0 0L8 8m4-4l4 4M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="text-xs font-medium">Upload</span>
          </span>
        )}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => pick(e.target.files?.[0] ?? null)}
      />

      {value && (
        <button
          type="button"
          onClick={() => pick(null)}
          className="mt-1.5 block text-xs font-semibold text-danger hover:underline"
        >
          Remove
        </button>
      )}

      {shown ? (
        <p className="mt-1 text-xs font-medium text-danger">{shown}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-ink-50">{hint}</p>
      ) : null}
    </div>
  )
}
