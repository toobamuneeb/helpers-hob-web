import { getBrowserSupabase } from '@/lib/supabase-browser'
import { DEFAULT_LOCALE, type Locale } from '@/lib/i18n/config'
import { i18n } from '@/lib/i18n'
import { translateAuthError } from '@/lib/i18n/authErrors'
import { setVerifyingSignIn } from './auth-gate'
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
  input: string,
  password: string,
  role: UserRole,
  /** Language picked on the sign-up form; becomes this account's default. */
  locale: Locale = DEFAULT_LOCALE,
): Promise<AuthResult> {
  const supabase = getBrowserSupabase()

  // Store one canonical form, so the profile row and every later lookup agree
  // on what this address is.
  const email = input.trim().toLowerCase()

  // Catch the common case early so the message can name the role they signed up
  // as. This only sees marketplace accounts — staff live in admin_users — so it
  // is a courtesy, not the check that makes this safe.
  //
  // Matched case-insensitively on purpose: an .eq() here misses an account
  // stored as ammar@gmail.com when someone types Ammar@Gmail.com, and the
  // signup then falls through to the generic "already exists" message instead
  // of naming the role. Wildcards are escaped because ilike treats % and _ as
  // patterns, and an address is allowed to contain them.
  const { data: existing } = await supabase
    .from('profiles')
    .select('role')
    .ilike('email', email.replace(/[%_\\]/g, '\\$&'))
    .eq('is_deleted', false)
    .maybeSingle()

  if (existing) {
    const as = existing.role === 'customer' ? 'a customer' : 'a service provider'
    return { success: false, error: i18n.t('auth.accountExistsAsRole', { role: as }) }
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { role } },
  })
  if (error) return { success: false, error: translateAuthError(error.message) }
  if (!data.user) return { success: false, error: i18n.t('auth.signupFailed') }

  // When the email is already registered, Supabase does not error — it returns a
  // decoy user with no identities, so an attacker cannot use signup to discover
  // who has an account. That decoy's id is not in auth.users, so inserting a
  // profile for it fails on profiles_user_id_fkey. Read the signal instead.
  if ((data.user.identities?.length ?? 0) === 0) {
    return {
      success: false,
      error: i18n.t('auth.accountExists'),
    }
  }

  // 'pending' here means "email not confirmed yet" — verifyOtp moves it on.
  const { error: profileError } = await supabase.from('profiles').insert({
    user_id: data.user.id,
    email,
    role,
    profile_status: 'pending',
    preferred_language: locale,
  })
  if (profileError) {
    // Anything left that trips the foreign key is the same underlying cause.
    if (profileError.message.includes('profiles_user_id_fkey')) {
      return { success: false, error: 'This email is already in use. Sign in instead, or use a different email.' }
    }
    return { success: false, error: profileError.message }
  }

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
  if (error) return { success: false, error: translateAuthError(error.message) }
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
  return error ? { success: false, error: translateAuthError(error.message) } : { success: true }
}

export async function signIn(
  email: string,
  password: string,
  expectedRole?: UserRole,
): Promise<AuthResult> {
  const supabase = getBrowserSupabase()

  // Held for the whole function: Supabase announces SIGNED_IN as soon as the
  // password is accepted, and the session provider must not act on that until
  // the role below has been checked. See auth-gate.
  setVerifyingSignIn(true)
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      // Same recovery path as mobile: unconfirmed accounts get a fresh OTP
      // instead of a dead end.
      if (/not confirmed/i.test(error.message)) {
        await resendOtp(email)
        return { success: false, emailNotConfirmed: true, error: translateAuthError(error.message) }
      }
      return { success: false, error: translateAuthError(error.message) }
    }
    if (!data.user) return { success: false, error: i18n.t('auth.loginFailed') }

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
  } finally {
    setVerifyingSignIn(false)
  }
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
      return { success: false, error: i18n.t('auth.noAccountFound') }
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
  return error ? { success: false, error: translateAuthError(error.message) } : { success: true }
}

export async function updatePassword(newPassword: string): Promise<AuthResult> {
  const { error } = await getBrowserSupabase().auth.updateUser({ password: newPassword })
  return error ? { success: false, error: translateAuthError(error.message) } : { success: true }
}
