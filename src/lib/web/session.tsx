'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { AuthChangeEvent } from '@supabase/supabase-js'
import { getBrowserSupabase } from '@/lib/supabase-browser'

export type UserRole = 'customer' | 'service_provider'
export type ProfileStatus = 'incomplete' | 'pending' | 'verified' | 'suspended'

export interface Profile {
  user_id: string
  role: UserRole
  email: string
  name: string | null
  phone: string | null
  country: string | null
  state: string | null
  city: string | null
  zip: string | null
  profile_image_url: string | null
  profile_status: ProfileStatus
  introduction: string | null
  id_card_front_url: string | null
  id_card_back_url: string | null
  location_address: string | null
  location_lat: number | null
  location_lng: number | null
  work_radius_km: number | null
  stripe_customer_id: string | null
  created_at: string
}

interface SessionValue {
  profile: Profile | null
  loading: boolean
  refresh: () => Promise<void>
  signOut: () => Promise<void>
  isCustomer: boolean
  isProvider: boolean
}

const SessionContext = createContext<SessionValue | null>(null)

/**
 * Holds the signed-in profile, mirroring the mobile app's redux userSlice.
 *
 * The profile row is read straight from Supabase rather than through /api,
 * exactly as the mobile app does in authService.getProfile — the API has no
 * "current user" endpoint, and adding one would mean touching routes the
 * mobile app already depends on.
 */
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const supabase = getBrowserSupabase()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setProfile(null)
      return
    }

    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()

    setProfile((data as Profile | null) ?? null)
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        await load()
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    // Keeps other tabs and token refreshes in sync.
    const supabase = getBrowserSupabase()
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event: AuthChangeEvent) => {
      if (event === 'SIGNED_OUT') {
        setProfile(null)
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        void load()
      }
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [load])

  const signOut = useCallback(async () => {
    await getBrowserSupabase().auth.signOut()
    setProfile(null)
  }, [])

  const value = useMemo<SessionValue>(
    () => ({
      profile,
      loading,
      refresh: load,
      signOut,
      isCustomer: profile?.role === 'customer',
      isProvider: profile?.role === 'service_provider',
    }),
    [profile, loading, load, signOut],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>')
  return ctx
}

/**
 * Where a signed-in profile belongs, mirroring RootNavigator.getInitialRouteName.
 * Returns null when the profile may stay where it is.
 */
export function routeForProfile(profile: Profile | null): string | null {
  if (!profile) return '/login'
  if (profile.profile_status === 'incomplete') {
    return profile.role === 'customer' ? '/create-profile' : '/provider/create-profile'
  }
  if (profile.profile_status === 'pending') return '/pending-approval'
  if (profile.profile_status === 'suspended') return '/suspended'
  return null
}
