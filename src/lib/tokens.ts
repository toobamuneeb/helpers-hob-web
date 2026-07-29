/**
 * Monthly subscription token helpers (server-side).
 * The provider's €5 token is charged when they mark a recurring job complete;
 * the customer's €15 token is handled in payments/create. Both are conditional
 * monthly subscriptions — charged at most once per calendar month per user, and
 * only in months where a recurring job is active.
 */
import { supabaseAdmin } from "./supabase";
import logger from "./logger";
import {
  APP_URL,
  MONTHLY_TOKEN_PROVIDER,
  currentPeriod,
  ensureCustomer,
  getDefaultPaymentMethod,
  chargePlatformOffSession,
  createTokenCheckoutSession,
} from "./stripe";

export interface TokenChargeResult {
  status: "already_paid" | "charged" | "pending_checkout" | "no_account";
  instant: boolean;
  checkoutUrl?: string | null;
  paymentId?: string;
}

/**
 * Check if provider needs to pay €5 token this month.
 * Returns token status and payment info for frontend to show payment modal.
 * NO automatic charging - frontend must confirm and use /api/payments/provider-token.
 */
export async function checkProviderTokenStatus(
  providerId: string,
  offerId: string,
): Promise<TokenChargeResult> {
  const period = currentPeriod();

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("stripe_customer_id, name, email")
    .eq("user_id", providerId)
    .single();

  const customerId = await ensureCustomer({
    existingCustomerId: profile?.stripe_customer_id,
    userId: providerId,
    name: profile?.name,
    email: profile?.email,
  });
  if (customerId !== profile?.stripe_customer_id) {
    await supabaseAdmin
      .from("profiles")
      .update({ stripe_customer_id: customerId })
      .eq("user_id", providerId);
  }

  const { data: rec } = await supabaseAdmin.rpc("record_token_payment", {
    p_user_id: providerId,
    p_offer_id: offerId,
    p_period: period,
    p_amount: MONTHLY_TOKEN_PROVIDER,
    p_kind: "provider_token",
  });
  
  if (rec?.already_paid) {
    return { status: "already_paid", instant: true, paymentId: rec.payment_id };
  }
  
  // Token needed - return pending status so frontend shows payment modal
  return {
    status: "pending_checkout",
    instant: false,
    paymentId: rec.payment_id,
  };
}
