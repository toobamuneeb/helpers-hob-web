'use client'

import { useEffect, useRef, useState } from 'react'
import { useT } from '@/lib/i18n'

export interface PickedLocation {
  address: string
  lat: string
  lng: string
  city?: string
  state?: string
  country?: string
  postalCode?: string
}

interface NominatimPlace {
  display_name: string
  lat: string
  lon: string
  address?: {
    city?: string
    town?: string
    village?: string
    state?: string
    country?: string
    postcode?: string
  }
}

/**
 * Address search with coordinates.
 *
 * Uses Nominatim (OpenStreetMap), the same free geocoder as the mobile
 * CustomLocationSearch — including its `countrycodes=nl` filter — so both
 * clients resolve the same places and store the same lat/lng.
 *
 * Coordinates matter beyond display: the provider job feed filters by distance
 * with them, so an address typed without picking a suggestion would leave a job
 * invisible to nearby providers.
 */
export default function LocationPicker({
  value,
  onChange,
  label,
  required,
  hint,
  error,
}: {
  value: PickedLocation | null
  onChange: (loc: PickedLocation | null) => void
  label?: string
  required?: boolean
  hint?: string
  error?: string
}) {
  const t = useT()
  const [query, setQuery] = useState(value?.address ?? '')
  const [results, setResults] = useState<NominatimPlace[]>([])
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const [locating, setLocating] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  // Debounced at 500ms, matching the mobile screen and Nominatim's usage policy.
  useEffect(() => {
    const text = query.trim()
    const tooShort = text.length < 3 || (value !== null && text === value.address)

    let cancelled = false
    const timer = setTimeout(() => {
      if (cancelled) return
      if (tooShort) {
        setResults([])
        return
      }
      void (async () => {
        setSearching(true)
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(text)}` +
              `&format=json&limit=5&addressdetails=1&countrycodes=nl`,
            { headers: { Accept: 'application/json' } },
          )
          const data = (await res.json()) as NominatimPlace[]
          if (!cancelled) {
            setResults(Array.isArray(data) ? data : [])
            setOpen(true)
          }
        } catch {
          if (!cancelled) setResults([])
        } finally {
          if (!cancelled) setSearching(false)
        }
      })()
    }, 500)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query, value])

  // Close the suggestions when the click lands outside.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  function pick(place: NominatimPlace) {
    const a = place.address ?? {}
    const picked: PickedLocation = {
      address: place.display_name,
      lat: place.lat,
      lng: place.lon,
      city: a.city ?? a.town ?? a.village,
      state: a.state,
      country: a.country,
      postalCode: a.postcode,
    }
    setQuery(place.display_name)
    onChange(picked)
    setResults([])
    setOpen(false)
  }

  function useMyLocation() {
    if (!navigator.geolocation) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}` +
              `&format=json&addressdetails=1`,
            { headers: { Accept: 'application/json' } },
          )
          const place = (await res.json()) as NominatimPlace
          if (place?.display_name) pick(place)
        } finally {
          setLocating(false)
        }
      },
      () => setLocating(false),
      { timeout: 10000 },
    )
  }

  return (
    <div ref={boxRef}>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="text-sm font-semibold text-ink-80">
          {label ?? t('ui.address')}
          {required && <span className="ml-0.5 text-danger">*</span>}
        </label>
        <button
          type="button"
          onClick={useMyLocation}
          disabled={locating}
          className="text-xs font-semibold text-accent-role hover:underline disabled:text-ink-50"
        >
          {locating ? t('ui.locating') : t('ui.useMyLocation')}
        </button>
      </div>

      <div className="relative">
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            // Typing invalidates the pinned coordinates until a suggestion is
            // chosen again — better than silently keeping the old point.
            if (value) onChange(null)
          }}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={t('ui.startTypingAnAddress')}
          autoComplete="off"
          className={`w-full rounded-lg border bg-surface px-3.5 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-ink-50 focus:border-accent-role focus:ring-1 focus:ring-accent-role ${
            error ? 'border-danger' : 'border-line'
          }`}
        />

        {searching && (
          <span className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2 border-line border-t-accent-role" />
        )}

        {open && results.length > 0 && (
          <ul className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-line bg-surface shadow-lg">
            {results.map((r) => (
              <li key={`${r.lat}-${r.lon}`}>
                <button
                  type="button"
                  onClick={() => pick(r)}
                  className="block w-full px-3.5 py-2.5 text-left text-sm text-ink-80 transition-colors hover:bg-accent-soft"
                >
                  {r.display_name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error ? (
        <p className="mt-1 text-xs font-medium text-danger">{error}</p>
      ) : value ? (
        <p className="mt-1 text-xs text-accent-role">
          ✓ Location pinned{value.city ? ` · ${value.city}` : ''}
        </p>
      ) : hint ? (
        <p className="mt-1 text-xs text-ink-50">{hint}</p>
      ) : (
        <p className="mt-1 text-xs text-ink-50">
          {t('ui.pickASuggestionSoProvidersNearby')}
        </p>
      )}
    </div>
  )
}
