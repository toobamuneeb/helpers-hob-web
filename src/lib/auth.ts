import { NextRequest } from 'next/server'
import { createSupabaseServerClient, supabaseAdmin } from './supabase'

export interface AuthUser {
  id: string
  email: string
  role: 'customer' | 'service_provider'
  profile_status: 'incomplete' | 'pending' | 'verified' | 'suspended'
  is_deleted: boolean
}

export async function authenticateRequest(request: NextRequest): Promise<AuthUser | null> {
  try {
    let userId: string | null = null

    // 1. Try Bearer token first (mobile app sends this)
    const authHeader = request.headers.get('authorization')
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7)
      console.log('🔑 Attempting to authenticate with Bearer token:', token.substring(0, 20) + '...')
      
      const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
      
      if (error) {
        console.error('❌ Supabase auth error:', error.message)
      }
      
      if (!error && user) {
        userId = user.id
        console.log('✅ User authenticated via Bearer token:', userId)
      } else {
        console.warn('⚠️ Bearer token authentication failed')
      }
    } else {
      console.log('ℹ️ No Bearer token in Authorization header')
    }

    // 2. Fallback to cookie-based session (web browser)
    if (!userId) {
      const { supabase } = createSupabaseServerClient(request)
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        userId = session.user.id
        console.log('✅ User authenticated via session cookie:', userId)
      }
    }

    if (!userId) {
      console.warn('❌ No valid authentication found')
      return null
    }

    // Fetch profile
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('user_id, email, role, profile_status, is_deleted')
      .eq('user_id', userId)
      .eq('is_deleted', false)
      .single()

    if (profileError) {
      console.error('❌ Profile fetch error:', profileError.message)
    }

    if (!profile) {
      console.warn('❌ No profile found for user:', userId)
      return null
    }

    console.log('✅ Full auth successful:', { userId: profile.user_id, role: profile.role })
    
    return {
      id: profile.user_id,
      email: profile.email,
      role: profile.role,
      profile_status: profile.profile_status,
      is_deleted: profile.is_deleted === true,
    }
  } catch (err) {
    console.error('❌ Auth exception:', err)
    return null
  }
}

// ── Account status gate ─────────────────────────────────────────────────────
// `incomplete` is deliberately NOT blocked: those users have confirmed their
// email but still need to reach profile creation. Everything else here is an
// account that must not transact until an admin acts.
const BLOCKED_STATUSES: Record<string, { code: string; error: string }> = {
  pending: {
    code: 'ACCOUNT_PENDING_APPROVAL',
    error: 'Your account is waiting for approval. You will be notified once it is reviewed.',
  },
  suspended: {
    code: 'ACCOUNT_SUSPENDED',
    error: 'Your account has been suspended. Please contact support.',
  },
}

export function requireAuth<T = any>(
  handler: (request: NextRequest, user: AuthUser, context?: T) => Promise<Response>,
  /** Escape hatch for routes an unapproved account must still reach. */
  options?: { allowUnapproved?: boolean },
) {
  return async (request: NextRequest, context?: T) => {
    const user = await authenticateRequest(request)
    
    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { 
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }

    // Gate here rather than per-route so a new endpoint is closed by default.
    // A removed account keeps its rows so the other party's bookings and
    // payments stay whole, but it must not be able to act. The flag is the gate,
    // and it outranks profile_status — including the allowUnapproved escape
    // hatch, which exists for accounts on their way in, not on their way out.
    if (user.is_deleted) {
      console.warn('\u26D4 Blocked request from removed account:', user.id)
      return new Response(
        JSON.stringify({
          error: 'This account has been removed. Please contact support.',
          code: 'ACCOUNT_REMOVED',
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const blocked = BLOCKED_STATUSES[user.profile_status]
    if (blocked && !options?.allowUnapproved) {
      console.warn('\u26D4 Blocked request from', user.profile_status, 'account:', user.id)
      return new Response(
        JSON.stringify({
          error: blocked.error,
          code: blocked.code,
          profile_status: user.profile_status,
        }),
        {
          status: 403,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }

    return handler(request, user, context)
  }
}

export function requireRole(role: 'customer' | 'service_provider') {
  return function<T = any>(handler: (request: NextRequest, user: AuthUser, context?: T) => Promise<Response>) {
    return requireAuth(async (request: NextRequest, user: AuthUser, context?: T) => {
      if (user.role !== role) {
        return new Response(
          JSON.stringify({ error: `${role} role required` }),
          { 
            status: 403,
            headers: { 'Content-Type': 'application/json' }
          }
        )
      }

      return handler(request, user, context)
    })
  }
}