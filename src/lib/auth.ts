import { NextRequest } from 'next/server'
import { createSupabaseServerClient, supabaseAdmin } from './supabase'

export interface AuthUser {
  id: string
  email: string
  role: 'customer' | 'service_provider'
  profile_status: 'incomplete' | 'pending' | 'verified' | 'suspended'
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
      .select('user_id, email, role, profile_status')
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
    }
  } catch (err) {
    console.error('❌ Auth exception:', err)
    return null
  }
}

export function requireAuth<T = any>(handler: (request: NextRequest, user: AuthUser, context?: T) => Promise<Response>) {
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