'use client'

// Shared primitives for the web app. Mirrors the mobile app's component set
// (CustomButton, CustomText, CustomJobCard…) so the two products feel like one.
// Colours come from the tokens appended to globals.css.
import Link from 'next/link'
import { useState, type ReactNode } from 'react'

// ── layout ──────────────────────────────────────────────────────────────────

export function Card({
  title,
  action,
  children,
  className = '',
  bleed = false,
}: {
  title?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  bleed?: boolean
}) {
  return (
    <section
      className={`overflow-hidden rounded-xl border border-line bg-surface shadow-[0_1px_2px_rgba(37,41,42,.04),0_4px_16px_-8px_rgba(37,41,42,.10)] ${className}`}
    >
      {(title || action) && (
        <header className="flex items-center justify-between gap-4 border-b border-line-soft px-5 py-4">
          <h2 className="text-[0.9rem] font-bold tracking-tight text-ink">{title}</h2>
          {action}
        </header>
      )}
      <div className={bleed ? '' : 'p-5'}>{children}</div>
    </section>
  )
}

export function PageTitle({ title, sub, action }: { title: string; sub?: ReactNode; action?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-[1.75rem] font-bold leading-tight tracking-[-0.02em] text-ink">
          {title}
        </h1>
        {sub && <p className="mt-1 text-sm leading-relaxed text-ink-70">{sub}</p>}
      </div>
      {action}
    </header>
  )
}

// ── status ──────────────────────────────────────────────────────────────────

// offer_status, payment_status and profile_status do not collide, so one map
// serves all three — same vocabulary the mobile app and admin panel use.
const BADGE_TONES: Record<string, string> = {
  pending: 'bg-warm text-[#9a5b25] ring-[#e8c3a4]',
  scheduled: 'bg-[#e6f1f8] text-secondary ring-[#b8d6e8]',
  active: 'bg-brand-pale text-brand-deep ring-[#a8d99a]',
  awaiting_confirmation: 'bg-[#e4f0ec] text-accent ring-[#a9cdc1]',
  completed: 'bg-brand-soft text-brand-deep ring-brand-tint',
  canceled: 'bg-surface-muted text-ink-70 ring-line',
  cancelled: 'bg-surface-muted text-ink-70 ring-line',
  paid: 'bg-brand-soft text-brand-deep ring-brand-tint',
  failed: 'bg-[#fdecec] text-danger ring-[#f5bcbc]',
  refunded: 'bg-warm-deep text-[#9a5b25] ring-[#e8c3a4]',
  expired: 'bg-surface-muted text-ink-50 ring-line',
  verified: 'bg-brand-soft text-brand-deep ring-brand-tint',
  incomplete: 'bg-surface-muted text-ink-70 ring-line',
  suspended: 'bg-[#fdecec] text-danger ring-[#f5bcbc]',
  rejected: 'bg-[#fdecec] text-danger ring-[#f5bcbc]',
  accepted: 'bg-brand-soft text-brand-deep ring-brand-tint',
}

/**
 * `label` overrides the wording without touching the colour, for the places the
 * mobile app words a status differently — an offer's `pending` reads "Awaiting
 * Response" on the Offers screen, for instance.
 */
export function Badge({ value, label }: { value?: string | null; label?: string }) {
  // Not every feed carries every status field — the provider's pending-offers
  // RPC returns offer_job_status and no offer_status, for one. A status chip is
  // never worth crashing a page over, so a missing value renders nothing.
  if (!value && !label) return null

  const tone = (value && BADGE_TONES[value]) || 'bg-surface-muted text-ink-70 ring-line'
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${tone}`}
    >
      {label ?? value?.replace(/_/g, ' ')}
    </span>
  )
}

// ── images ──────────────────────────────────────────────────────────────────
// User-uploaded URLs of unknown provenance, so a plain <img> with an onError
// fallback rather than next/image: a dead or off-host URL must degrade to
// initials, not throw.

const AVATAR_SIZES = {
  sm: 'h-8 w-8 text-[0.65rem]',
  md: 'h-11 w-11 text-xs',
  lg: 'h-20 w-20 text-xl',
} as const

function initials(name?: string | null): string {
  if (!name?.trim()) return '?'
  const parts = name.trim().split(/\s+/)
  const letters =
    parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2)
  return letters.toUpperCase()
}

export function Avatar({
  src,
  name,
  size = 'md',
}: {
  src?: string | null
  name?: string | null
  size?: keyof typeof AVATAR_SIZES
}) {
  const [failed, setFailed] = useState(false)
  const box = `${AVATAR_SIZES[size]} shrink-0 rounded-full object-cover`

  if (!src || failed) {
    return (
      <span
        className={`${box} flex items-center justify-center bg-accent-tint font-bold text-ink`}
        aria-hidden
      >
        {initials(name)}
      </span>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- see note above
    <img
      src={src}
      alt=""
      className={`${box} bg-surface-muted ring-1 ring-line`}
      onError={() => setFailed(true)}
      loading="lazy"
    />
  )
}

export function Thumb({
  src,
  alt = '',
  className = 'h-32 w-full',
}: {
  src?: string | null
  alt?: string
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) {
    return (
      <span
        className={`${className} flex items-center justify-center bg-surface-muted text-ink-50`}
        aria-hidden
      >
        <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
          <path
            d="M3 16l4.5-4.5a2 2 0 012.8 0L15 16m-2-2l1.8-1.8a2 2 0 012.8 0L21 15M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- see note above
    <img
      src={src}
      alt={alt}
      className={`${className} object-cover`}
      onError={() => setFailed(true)}
      loading="lazy"
    />
  )
}

// ── controls ────────────────────────────────────────────────────────────────

export function Button({
  children,
  onClick,
  variant = 'accent',
  size = 'md',
  disabled,
  loading,
  type = 'button',
  fullWidth,
  className = '',
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'accent' | 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  loading?: boolean
  type?: 'button' | 'submit'
  fullWidth?: boolean
  className?: string
}) {
  // Matches the mobile CustomButton exactly:
  //   primary  → COLORS.primary  #4AA224 with staticBlack text (not white —
  //              black is what the app uses, and it reads far better on this green)
  //   secondary→ COLORS.secondary #0064A0
  //   outline  → transparent, 1px COLORS.darkGreen border and text
  //   disabled → opacity 0.5, same as the app
  const variants = {
    // Follows the signed-in role, like `variant={isProvider ? 'secondary' : 'primary'}`
    // in the app: green for customers, blue for providers.
    accent: 'bg-accent-role text-accent-on hover:opacity-90',
    primary: 'bg-brand text-black hover:bg-[#43911f]',
    secondary: 'bg-secondary text-white hover:opacity-90',
    outline: 'bg-transparent text-dark-green ring-1 ring-inset ring-dark-green hover:bg-brand-soft',
    danger: 'bg-danger text-white hover:bg-[#d93f3f]',
    ghost: 'bg-transparent text-dark-green hover:bg-brand-soft',
  }
  // Mobile radius is sizeLevel.S4 (~4px) — noticeably squarer than a web
  // default. rounded-md is the closest match.
  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2.5 text-sm',
    lg: 'px-6 py-3.5 text-base',
  }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-md font-semibold tracking-tight transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-role focus-visible:ring-offset-2 active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 ${variants[variant]} ${sizes[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
    >
      {loading && (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </button>
  )
}

// Mobile inputs use borderRadius sizeLevel.S8 (~7px) → rounded-lg.
export const INPUT_CLASS =
  'w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-ink-50 focus:border-brand focus:ring-1 focus:ring-brand disabled:bg-surface-muted'

export function Field({
  label,
  error,
  hint,
  required,
  children,
}: {
  label: string
  error?: string
  hint?: string
  required?: boolean
  children: ReactNode
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-semibold text-ink-80">
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </label>
      {children}
      {error ? (
        <p className="mt-1 text-xs font-medium text-danger">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-ink-50">{hint}</p>
      ) : null}
    </div>
  )
}

// ── feedback ────────────────────────────────────────────────────────────────

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl bg-[#fdecec] px-4 py-3 text-sm font-medium text-danger ring-1 ring-inset ring-[#f5bcbc]">
      {children}
    </p>
  )
}

export function Empty({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <span
        aria-hidden
        className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-accent-soft text-accent-role"
      >
        <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
          <path
            d="M9 3h6l1 3h3a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h3l1-3z"
            stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"
          />
          <path d="M12 11v5m-2.5-2.5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </span>
      <p className="text-base font-bold tracking-tight text-ink">{title}</p>
      {sub && <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-ink-70">{sub}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

/**
 * Content-shaped loading placeholder.
 *
 * A bare spinner tells the user nothing about what is coming; a skeleton keeps
 * the layout stable and makes the wait feel shorter.
 */
export function Skeleton({ className = '' }: { className?: string }) {
  return <span className={`block animate-pulse rounded-md bg-line-soft ${className}`} />
}

export function CardSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-line bg-surface p-4">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="mt-2 h-3 w-1/2" />
          <div className="mt-4 flex items-center gap-2 border-t border-line-soft pt-3">
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="ml-auto h-4 w-16" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <ul className="divide-y divide-line-soft">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 px-5 py-4">
          <Skeleton className="h-10 w-10 rounded-full" />
          <span className="flex-1">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="mt-2 h-3 w-1/2" />
          </span>
          <Skeleton className="h-4 w-14" />
        </li>
      ))}
    </ul>
  )
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-sm text-ink-50">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-brand-deep" />
      {label}
    </div>
  )
}

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-sm font-semibold text-ink-50 transition-colors hover:text-brand-deep"
    >
      ← {children}
    </Link>
  )
}

// ── formatting ──────────────────────────────────────────────────────────────

export function money(value: unknown, currency = 'EUR'): string {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''))
  if (!Number.isFinite(n)) return '—'
  return new Intl.NumberFormat('en-IE', { style: 'currency', currency }).format(n)
}

export function date(value?: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-IE', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function time(value?: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' })
}

export function dateTime(value?: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return `${date(value)} · ${time(value)}`
}

/**
 * A password box with a reveal toggle.
 *
 * The eye sits inside the field, so the input needs right padding to keep the
 * text from running under it. Toggling swaps the type on the same element, so
 * the value and cursor survive.
 */
export function PasswordInput({
  value,
  onChange,
  placeholder,
  autoComplete = 'current-password',
  minLength,
  required,
  disabled,
  className = '',
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  autoComplete?: string
  minLength?: number
  required?: boolean
  disabled?: boolean
  className?: string
}) {
  const [shown, setShown] = useState(false)

  return (
    <div className="relative">
      <input
        type={shown ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        minLength={minLength}
        required={required}
        disabled={disabled}
        className={`${INPUT_CLASS} pr-11 ${className}`}
      />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        disabled={disabled}
        aria-label={shown ? 'Hide password' : 'Show password'}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-ink-50 transition-colors hover:text-ink-70 disabled:opacity-50"
      >
        <svg viewBox="0 0 24 24" fill="none" className="h-[1.15rem] w-[1.15rem]">
          {shown ? (
            <>
              <path d="M3 3l18 18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              <path d="M10.6 10.6a2 2 0 002.8 2.8M9.4 5.2A9.5 9.5 0 0112 5c5 0 9 4.5 9 7a12 12 0 01-2.4 3.3M6.2 6.7A12.3 12.3 0 003 12c0 2.5 4 7 9 7a9.7 9.7 0 004.3-1"
                stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </>
          ) : (
            <>
              <path d="M3 12s3.6-7 9-7 9 7 9 7-3.6 7-9 7-9-7-9-7z"
                stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.7" />
            </>
          )}
        </svg>
      </button>
    </div>
  )
}

/**
 * A work category as both apps draw it: the image from skills.icon on the
 * pastel from skills.color.
 *
 * skills.icon holds a URL, not an icon name — the mobile Home tile passes it
 * straight to an <Image source={{uri}}>. A plain <img> here for the same
 * reason: the URL is user-managed storage of unknown dimensions, and if it
 * will not load the initial has to take over rather than leave a hole.
 */
export function SkillIcon({
  icon,
  color,
  name,
  size = 44,
}: {
  icon: string | null
  color: string | null
  name: string
  size?: number
}) {
  const [broken, setBroken] = useState(false)

  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full"
      style={{ backgroundColor: color ?? '#EEFFF2', width: size, height: size }}
    >
      {icon && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={icon}
          alt=""
          width={Math.round(size * 0.52)}
          height={Math.round(size * 0.52)}
          className="object-contain"
          onError={() => setBroken(true)}
        />
      ) : (
        <span className="font-bold text-ink-70" style={{ fontSize: size * 0.36 }}>
          {name.slice(0, 1).toUpperCase()}
        </span>
      )}
    </span>
  )
}
