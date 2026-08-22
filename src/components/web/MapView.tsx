'use client'

import { useState } from 'react'

/**
 * Job location map.
 *
 * The mobile MapPreview renders OpenStreetMap raster tiles at zoom 14 with a
 * pin. The OSM embed gives the same tiles and marker without adding a map
 * library or an API key, and it stays consistent with the Nominatim geocoder
 * already used for address search.
 */
export default function MapView({
  lat,
  lng,
  address,
  height = 'h-56',
}: {
  lat?: number | string | null
  lng?: number | string | null
  address?: string | null
  height?: string
}) {
  const [failed, setFailed] = useState(false)

  const latNum = typeof lat === 'string' ? parseFloat(lat) : lat
  const lngNum = typeof lng === 'string' ? parseFloat(lng) : lng
  const hasPoint = Number.isFinite(latNum) && Number.isFinite(lngNum)

  // Older jobs predate coordinates being saved, so fall back to the address.
  if (!hasPoint || failed) {
    return (
      <div className={`${height} flex flex-col items-center justify-center gap-2 rounded-lg bg-surface-muted px-4 text-center`}>
        <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6 text-ink-50">
          <path d="M12 21s7-5.686 7-11a7 7 0 10-14 0c0 5.314 7 11 7 11z" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="12" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        <p className="text-sm text-ink-70">{address ?? 'No location set'}</p>
      </div>
    )
  }

  // ~zoom 14, matching the mobile camera.
  const d = 0.008
  const bbox = [lngNum! - d, latNum! - d, lngNum! + d, latNum! + d].join('%2C')
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${latNum}%2C${lngNum}`

  return (
    <div className="space-y-2">
      <iframe
        title={address ?? 'Job location'}
        src={src}
        loading="lazy"
        onError={() => setFailed(true)}
        className={`${height} w-full rounded-lg border border-line`}
      />
      <div className="flex items-start justify-between gap-3">
        {address && <p className="min-w-0 flex-1 text-sm text-ink-70">{address}</p>}
        <a
          href={`https://www.openstreetmap.org/?mlat=${latNum}&mlon=${lngNum}#map=16/${latNum}/${lngNum}`}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 text-sm font-semibold text-accent-role hover:underline"
        >
          Open map
        </a>
      </div>
    </div>
  )
}
