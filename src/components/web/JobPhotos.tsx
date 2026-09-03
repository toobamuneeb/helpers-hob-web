'use client'

// How a job's photos are shown, everywhere they are shown.
//
// Three cases, because a job can now have any number of photos:
//   none  — a placeholder built from the job's category, so a card without a
//           photo still fills its frame instead of collapsing. Cards used to
//           render the image only `{image_url && <Thumb/>}`, which left rows of
//           mismatched heights whenever someone skipped the upload.
//   one   — the photo, plain.
//   many  — a carousel on the detail screen; on a card, the first photo with a
//           count badge, since a card is not somewhere you swipe.

import { useState } from 'react'
import { SkillIcon, Thumb } from '@/components/web/ui'
import { useT } from '@/lib/i18n'

export interface JobSkill {
  name?: string | null
  icon?: string | null
  color?: string | null
}

function Placeholder({ skill, className }: { skill?: JobSkill; className: string }) {
  return (
    <div
      className={`${className} flex flex-col items-center justify-center gap-2`}
      style={{ backgroundColor: skill?.color ?? 'var(--surface-muted, #F3F4F6)' }}
    >
      <SkillIcon icon={skill?.icon ?? null} color="transparent" name={skill?.name ?? '?'} size={40} />
      {skill?.name && (
        <span className="px-2 text-center text-xs font-semibold text-ink-70">{skill.name}</span>
      )}
    </div>
  )
}

export default function JobPhotos({
  urls,
  skill,
  variant = 'card',
  className = 'h-32 w-full',
}: {
  urls?: string[] | null
  skill?: JobSkill
  variant?: 'card' | 'detail'
  className?: string
}) {
  const t = useT()
  const [index, setIndex] = useState(0)
  const photos = (urls ?? []).filter(Boolean)

  if (photos.length === 0) return <Placeholder skill={skill} className={className} />

  if (photos.length === 1 || variant === 'card') {
    return (
      <div className={`${className} relative overflow-hidden`}>
        <Thumb src={photos[0]} className="h-full w-full" />
        {photos.length > 1 && (
          <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-xs font-semibold text-white">
            +{photos.length - 1}
          </span>
        )}
      </div>
    )
  }

  // Wraps in both directions: at the last photo, Next returns to the first.
  const go = (step: number) => setIndex((i) => (i + step + photos.length) % photos.length)

  return (
    <div className={`${className} relative overflow-hidden`}>
      <Thumb src={photos[index]} className="h-full w-full" />

      <button
        type="button"
        onClick={() => go(-1)}
        aria-label={t('jobs.previousPhoto')}
        className="absolute left-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70"
      >
        <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
          <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <button
        type="button"
        onClick={() => go(1)}
        aria-label={t('jobs.nextPhoto')}
        className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70"
      >
        <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
          <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <div className="absolute inset-x-0 bottom-2 flex items-center justify-center gap-1.5">
        {photos.map((photo, i) => (
          <button
            key={photo}
            type="button"
            onClick={() => setIndex(i)}
            aria-label={t('jobs.photoNumber', { number: i + 1 })}
            aria-current={i === index}
            className={`h-1.5 rounded-full transition-all ${
              i === index ? 'w-5 bg-white' : 'w-1.5 bg-white/60 hover:bg-white/80'
            }`}
          />
        ))}
      </div>
    </div>
  )
}
