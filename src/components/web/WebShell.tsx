'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { routeForProfile, useSession } from '@/lib/web/session'
import { Avatar, Spinner } from './ui'

const PUBLIC_ROUTES = [
  '/', '/role', '/login', '/signup', '/verify',
  '/forgot-password', '/reset-password', '/privacy-policy', '/help',
]

const GATE_ROUTES = [
  '/create-profile', '/provider/create-profile', '/pending-approval', '/suspended', '/removed',
]

const ICONS: Record<string, string> = {
  home: 'M3 10.5L12 3l9 7.5M5 9.5V20a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1V9.5',
  bookings: 'M8 3v3m8-3v3M4 9h16M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z',
  jobs: 'M9 6V5a2 2 0 012-2h2a2 2 0 012 2v1M3 9a1 1 0 011-1h16a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V9zm0 4h18',
  offers: 'M20 12V8H6a2 2 0 010-4h12v4m0 4v4H6a2 2 0 100 4h12v-4',
  calendar: 'M8 3v3m8-3v3M4 9h16M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1zM9 14h2v2H9z',
  chats: 'M21 12a8 8 0 01-8 8H7l-4 3V12a8 8 0 018-8h2a8 8 0 018 8z',
  profile: 'M20 21v-1a5 5 0 00-5-5H9a5 5 0 00-5 5v1M12 12a4 4 0 100-8 4 4 0 000 8z',
}

// Labels are the mobile app's, so the two products name the same thing the
// same way. Bottom-tab items are marked so the mobile bar stays at five.
const CUSTOMER_NAV = [
  { href: '/home', label: 'Home', icon: 'home', tab: true },
  { href: '/bookings', label: 'Booking/Tasks', icon: 'bookings', tab: true, short: 'Bookings' },
  { href: '/offers', label: 'My Sent Offers', icon: 'offers', short: 'Offers' },
  { href: '/my-jobs', label: 'My Jobs', icon: 'jobs', tab: true, short: 'My Jobs' },
  { href: '/chats', label: 'Messages', icon: 'chats', tab: true, short: 'Chats' },
  { href: '/profile', label: 'Profile', icon: 'profile', tab: true },
]

const PROVIDER_NAV = [
  { href: '/provider/home', label: 'Home', icon: 'home', tab: true },
  { href: '/provider/jobs', label: 'Jobs', icon: 'jobs', tab: true },
  { href: '/offers', label: 'Pending Offers', icon: 'offers', short: 'Offers' },
  { href: '/provider/calendar', label: 'Calendar', icon: 'calendar', tab: true },
  { href: '/chats', label: 'Messages', icon: 'chats', tab: true, short: 'Chats' },
  { href: '/profile', label: 'Profile', icon: 'profile', tab: true },
]

function NavIcon({ d, className = 'h-[1.15rem] w-[1.15rem]' }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`${className} shrink-0`}>
      <path d={d} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function WebShell({ children }: { children: React.ReactNode }) {
  const { profile, loading, signOut } = useSession()
  const pathname = usePathname()
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)

  const isPublic = PUBLIC_ROUTES.includes(pathname) || pathname.startsWith('/verify')
  const isGate = GATE_ROUTES.includes(pathname)

  // Same gating as the mobile RootNavigator.
  useEffect(() => {
    if (loading) return
    if (!profile) {
      if (!isPublic) router.replace('/login')
      return
    }
    const target = routeForProfile(profile)
    if (target && pathname !== target) { router.replace(target); return }
    if (!target && (isPublic || isGate) && pathname !== '/') {
      router.replace(profile.role === 'customer' ? '/home' : '/provider/home')
    }
  }, [loading, profile, pathname, isPublic, isGate, router])

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center"><Spinner /></div>
  }
  if (isPublic || isGate) return <>{children}</>
  if (!profile) return null

  const nav = profile.role === 'customer' ? CUSTOMER_NAV : PROVIDER_NAV
  const tabs = nav.filter((n) => n.tab)
  const isActive = (href: string) =>
    href === '/home' || href === '/provider/home'
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`)
  const homeHref = profile.role === 'customer' ? '/home' : '/provider/home'

  const navList = (
    <nav className="flex-1 space-y-0.5 px-3 py-4">
      {nav.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={() => setMenuOpen(false)}
          className={`relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${
            isActive(item.href)
              ? 'bg-accent-soft text-accent-role'
              : 'text-ink-70 hover:bg-surface-muted hover:text-ink'
          }`}
        >
          {isActive(item.href) && (
            <span aria-hidden className="absolute inset-y-1.5 left-0 w-1 rounded-r-full bg-accent-role" />
          )}
          <NavIcon d={ICONS[item.icon]} />
          {item.label}
        </Link>
      ))}
    </nav>
  )

  const identity = (
    <div className="border-t border-line-soft p-3">
      <Link
        href="/profile"
        onClick={() => setMenuOpen(false)}
        className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-surface-muted"
      >
        <Avatar src={profile.profile_image_url} name={profile.name ?? profile.email} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-ink">
            {profile.name ?? profile.email}
          </span>
          <span className="block text-xs text-ink-50">
            {profile.role === 'customer' ? 'Customer' : 'Service provider'}
          </span>
        </span>
      </Link>
      <button
        onClick={signOut}
        className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-ink-50 transition-colors hover:bg-surface-muted hover:text-ink"
      >
        Sign out
      </button>
    </div>
  )

  const brand = (
    <Link href={homeHref} className="flex items-center gap-2.5 border-b border-line-soft px-5 py-4">
      <Image src="/logo.png" alt="HelpersHob" width={34} height={31} priority className="h-auto" />
      <span className="text-[0.95rem] font-bold tracking-tight text-ink">HelpersHob</span>
    </Link>
  )

  return (
    <div data-role={profile.role} className="flex min-h-screen">
      {/* Fixed sidebar from lg — gives the app a frame instead of a floating page. */}
      <aside className="hidden w-[16.5rem] shrink-0 flex-col border-r border-line bg-surface lg:flex">
        {brand}
        {navList}
        {identity}
      </aside>

      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button aria-label="Close menu" onClick={() => setMenuOpen(false)}
            className="absolute inset-0 bg-ink/40" />
          <div className="absolute inset-y-0 left-0 flex w-[16.5rem] max-w-[80vw] flex-col bg-surface shadow-xl">
            {brand}{navList}{identity}
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col bg-canvas">
        <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-line bg-surface/85 px-4 py-2.5 backdrop-blur-md lg:hidden">
          <button onClick={() => setMenuOpen(true)} aria-label="Open menu" aria-expanded={menuOpen}
            className="rounded-lg p-2 text-ink-70 transition-colors hover:bg-surface-muted">
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
              <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
          <Image src="/logo.png" alt="" width={28} height={26} className="h-auto" />
          <span className="text-sm font-bold tracking-tight text-ink">
            {nav.find((i) => isActive(i.href))?.label ?? 'HelpersHob'}
          </span>
          <Link href="/profile" className="ml-auto">
            <Avatar src={profile.profile_image_url} name={profile.name ?? profile.email} size="sm" />
          </Link>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-24 pt-6 sm:px-6 lg:pb-12 lg:pt-9">
          {children}
        </main>

        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur lg:hidden">
          <div className="flex">
            {tabs.map((item) => (
              <Link key={item.href} href={item.href}
                className={`relative flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[0.65rem] font-semibold transition-colors ${
                  isActive(item.href) ? 'text-accent-role' : 'text-ink-50'}`}>
                {isActive(item.href) && (
                  <span aria-hidden className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-accent-role" />
                )}
                <NavIcon d={ICONS[item.icon]} className="h-5 w-5" />
                {item.short ?? item.label}
              </Link>
            ))}
          </div>
        </nav>
      </div>
    </div>
  )
}
