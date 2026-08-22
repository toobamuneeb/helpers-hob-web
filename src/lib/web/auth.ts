import { getBrowserSupabase } from '@/lib/supabase-browser'
import type { UserRole } from './session'

/**
 * Auth flows for the web app.

 *
 *   signup            → profile row inserted with profile_status 'pending'
 *   verifyOtp(signup) → moved to 'incomplete'
 *   create profile    → customer 'verified' / provider back to 'pending'
 *
 * Anything that diverges here shows up as accounts stuck in the wrong state.
 */

export interface AuthResult {
  success: boolean
  error?: string
  /** Supabase requires the email OTP before the session is usable. */
  emailNotConfirmed?: boolean
  userId?: string
}

export async function signUp(
  email: string,
  password: string,
  role: UserRole,
): Promise<AuthResult> {
  const supabase = getBrowserSupabase()

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { role } },
  })
  if (error) return { success: false, error: error.message }
  if (!data.user) return { success: false, error: 'Signup failed' }

  // 'pending' here means "email not confirmed yet" — verifyOtp moves it on.
  const { error: profileError } = await supabase.from('profiles').insert({
    user_id: data.user.id,
    email,
    role,
    profile_status: 'pending',
  })
  if (profileError) return { success: false, error: profileError.message }

  return { success: true, userId: data.user.id }
}

export async function verifyOtp(
  email: string,
  token: string,
  type: 'signup' | 'recovery',
): Promise<AuthResult> {
  const supabase = getBrowserSupabase()

  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: type === 'signup' ? 'email' : 'recovery',
  })
  if (error) return { success: false, error: error.message }
  if (!data.user) return { success: false, error: 'Verification failed' }

  if (type === 'signup') {
    // Email confirmed; the profile still has to be filled in.
    await supabase
      .from('profiles')
      .update({ profile_status: 'incomplete' })
      .eq('user_id', data.user.id)
  }

  return { success: true, userId: data.user.id }
}

export async function resendOtp(email: string): Promise<AuthResult> {
  const { error } = await getBrowserSupabase().auth.resend({ type: 'signup', email })
  return error ? { success: false, error: error.message } : { success: true }
}

export async function signIn(
  email: string,
  password: string,
  expectedRole?: UserRole,
): Promise<AuthResult> {
  const supabase = getBrowserSupabase()

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    // Same recovery path as mobile: unconfirmed accounts get a fresh OTP
    // instead of a dead end.
    if (/not confirmed/i.test(error.message)) {
      await resendOtp(email)
      return { success: false, emailNotConfirmed: true, error: error.message }
    }
    return { success: false, error: error.message }
  }
  if (!data.user) return { success: false, error: 'Login failed' }

  if (!data.user.email_confirmed_at) {
    await resendOtp(email)
    return { success: false, emailNotConfirmed: true }
  }

  // The two sides have separate sign-in pages; landing on the wrong one would
  // otherwise drop the user into an app built for the other role.
  if (expectedRole) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('user_id', data.user.id)
      .maybeSingle()

    if (profile && profile.role !== expectedRole) {
      await supabase.auth.signOut()
      const actual = profile.role === 'customer' ? 'customer' : 'service provider'
      return {
        success: false,
        error: `This account is registered as a ${actual}. Please sign in from the ${actual} page.`,
      }
    }
  }

  return { success: true, userId: data.user.id }
}

export async function sendPasswordResetOtp(
  email: string,
  expectedRole?: UserRole,
): Promise<AuthResult> {
  const supabase = getBrowserSupabase()

  if (expectedRole) {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('email', email)
      .eq('is_deleted', false)
      .maybeSingle()

    if (error || !profile) {
      return { success: false, error: 'No account found with this email address' }
    }
    if (profile.role !== expectedRole) {
      const actual = profile.role === 'customer' ? 'customer' : 'service provider'
      return {
        success: false,
        error: `This account is registered as a ${actual}. Please use the correct page.`,
      }
    }
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email)
  return error ? { success: false, error: error.message } : { success: true }
}

export async function updatePassword(newPassword: string): Promise<AuthResult> {
  const { error } = await getBrowserSupabase().auth.updateUser({ password: newPassword })
  return error ? { success: false, error: error.message } : { success: true }
}
