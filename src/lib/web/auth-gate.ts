/**
 * Held while signIn checks that an account belongs on the page it was entered
 * from.
 *
 * Supabase fires SIGNED_IN the moment the password checks out — before anyone
 * has looked at the account's role. Without this the session provider loads the
 * profile on that event and the shell redirects straight into the other side of
 * the app, while signIn is still reading the role and getting ready to reject.
 * Whichever finished first won, so entering a provider's email on the customer
 * page sometimes let you through.
 *
 * The listener waits while this is set. Sign-in that passes the check calls
 * refresh() itself, so nothing is lost by holding the event.
 */
let verifying = false

export function isVerifyingSignIn(): boolean {
  return verifying
}

export function setVerifyingSignIn(value: boolean): void {
  verifying = value
}
