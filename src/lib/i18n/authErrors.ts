// Translations for the errors Supabase Auth returns.
//
// Supabase answers in English — it has no idea what language the person is
// using — and these messages went straight into a toast, so a Dutch user hit
// English the moment anything went wrong with a code or a password.
//
// Matched on the exact message rather than a code because that is what the
// client library hands over. Anything unrecognised passes through unchanged,
// which is better than swallowing a message nobody has seen before.
import { i18n } from '@/lib/i18n'

const KEYS: Record<string, string> = {
  'Token has expired or is invalid': 'authError.tokenExpired',
  'Invalid login credentials': 'authError.invalidCredentials',
  'Email not confirmed': 'authError.emailNotConfirmed',
  'User already registered': 'authError.userAlreadyRegistered',
  'A user with this email address has already been registered':
    'authError.userAlreadyRegistered',
  'Signups not allowed for otp': 'authError.signupsNotAllowed',
  'Email rate limit exceeded': 'authError.rateLimit',
  'For security purposes, you can only request this after 60 seconds.':
    'authError.tooSoon',
  'Unable to validate email address: invalid format': 'authError.invalidEmail',
  'Password should be at least 6 characters': 'authError.passwordTooShort',
  'New password should be different from the old password':
    'authError.passwordSameAsOld',
  'User not found': 'authError.userNotFound',
  'Network request failed': 'authError.networkFailed',
};

/** The translated message, or the original when it is not one we know. */
export function translateAuthError(message?: string | null): string | undefined {
  if (!message) return undefined;
  const key = KEYS[message.trim()];
  if (key) return i18n.t(key);

  // Supabase prefixes some rate-limit messages with a wait time that changes
  // per request, so an exact match never lands.
  if (/only request this after \d+ seconds/i.test(message)) {
    return i18n.t('authError.tooSoon');
  }
  return message;
}
