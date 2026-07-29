/**
 * Stripe Connect Integration
 * ---------------------------------------------------------------------------
 * Replaces the previous Mollie integration. Uses:
 *  - Connect **Express** accounts for providers (onboarding via Account Links).
 *  - A platform **Customer** per app user for saving cards (SetupIntent) so we
 *    can charge them off-session (recurring tokens, saved-card job payments).
 *  - **Destination charges** (application_fee_amount + transfer_data.destination
 *    + on_behalf_of) to split a job payment: provider gets their payout, the
 *    platform keeps its cut, Stripe's processing fee is split 50/50 between the
 *    two parties so the platform nets its percentage exactly.
 *  - **Checkout Sessions** (hosted, opened in a WebView) for new cards, and
 *    direct off-session PaymentIntents for saved cards / monthly tokens.
 *
 * All amounts inside Stripe are in **cents** (integer). Everything we expose to
 * the rest of the app is in **euros** (number) unless noted.
 */

import Stripe from "stripe";
import logger from "./logger";

// ── Lazy client ────────────────────────────────────────────────────────────
// Do NOT construct at module load with an empty key — that throws during the
// Vercel build (env not injected at collect-page-data time). Construct on first
// use instead, and throw a clear error only when a route actually needs Stripe.
let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key === "your_stripe_secret_key_here") {
    throw new Error(
      "STRIPE_SECRET_KEY is not configured. Add it to .env.local (sk_test_… for test mode).",
    );
  }
  // Use the SDK's built-in pinned API version (stripe-node 22.x) rather than a
  // hard-coded string, so we never send a version the installed SDK rejects.
  _stripe = new Stripe(key, {
    appInfo: { name: "HelpersHob", version: "1.0.0" },
  });
  return _stripe;
}

export function isStripeTestMode(): boolean {
  return (process.env.STRIPE_SECRET_KEY || "").startsWith("sk_test_");
}

export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

// ── Money helpers ────────────────────────────────────────────────────────────
export const toCents = (euros: number): number => Math.round(euros * 100);
export const toEuros = (cents: number): number => Math.round(cents) / 100;

// ═══════════════════════════════════════════════════════════════════════════
//  FEE MODEL
// ═══════════════════════════════════════════════════════════════════════════
//
//  One-time job (always online):
//    Customer pays  = S + 10%·S + fee/2
//    Provider gets  = S − 10%·S − fee/2
//    Platform net   = 20%·S            (exact)
//
//  Recurring job (online), per job:
//    Customer pays  = S + 1%·S + fee/2
//    Provider gets  = S − 1%·S − fee/2
//    Platform net   = 2%·S             (exact)
//    + monthly tokens (charged separately, see MONTHLY_TOKEN_*).
//
//  Recurring job (cash): the €S is collected by the provider in cash. Nothing
//  is split online; the platform only charges the monthly tokens.
//
//  "fee" is the ACTUAL Stripe processing fee on the customer charge. Because it
//  depends on the total (which depends on the fee), we estimate it up-front and
//  split it 50/50 so the platform's application fee always covers it and the
//  platform nets its percentage exactly. The webhook records the real fee from
//  the charge's balance transaction for reporting.
// ═══════════════════════════════════════════════════════════════════════════

// Stripe standard EEA pricing. Overridable via env for other regions/cards.
const STRIPE_FEE_PERCENT = parseFloat(
  process.env.STRIPE_FEE_PERCENT || "0.015",
); // 1.5%
const STRIPE_FEE_FIXED = parseFloat(process.env.STRIPE_FEE_FIXED || "0.25"); // €0.25

export const MONTHLY_TOKEN_CUSTOMER = parseFloat(
  process.env.MONTHLY_TOKEN_CUSTOMER || "15",
);
export const MONTHLY_TOKEN_PROVIDER = parseFloat(
  process.env.MONTHLY_TOKEN_PROVIDER || "5",
);

/**
 * Estimate the Stripe processing fee (euros) for a customer charge whose net
 * (excluding the fee itself) is `baseEuros`. Solves the circular dependency:
 *   total = base + fee/2 ; fee = pct·total + fixed
 * so the returned fee matches what Stripe will take on the final total.
 */
export function estimateStripeFee(baseEuros: number): number {
  // total = base + fee/2 ; fee = pct·total + fixed
  // total = base + (pct·total + fixed)/2 → total(1 − pct/2) = base + fixed/2
  const total =
    (baseEuros + STRIPE_FEE_FIXED / 2) / (1 - STRIPE_FEE_PERCENT / 2);
  const fee = STRIPE_FEE_PERCENT * total + STRIPE_FEE_FIXED;
  return Math.round(fee * 100) / 100;
}

export interface JobBreakdown {
  service_amount: number; // S
  is_recurring: boolean;
  pay_through_platform: boolean;
  stripe_fee: number; // estimated actual fee (split 50/50)
  fee_half: number; // fee/2 (each side's share)
  customer_fee: number; // percentage part the customer adds (10%/1%)
  provider_fee: number; // percentage part deducted from provider (10%/1%)
  customer_charge: number; // total charged to the customer online (euros)
  provider_payout: number; // amount transferred to the provider (euros)
  application_fee: number; // application_fee_amount on the charge (euros)
  platform_net: number; // what the platform keeps after Stripe's fee (euros)
  cash_amount: number; // amount paid in cash to provider (cash recurring)
}

/**
 * Compute the per-job payment breakdown for the new Stripe model.
 * Mirrors calculate_stripe_breakdown() in SQL — keep both in sync.
 */
export function computeJobBreakdown(params: {
  serviceAmount: number;
  isRecurring: boolean;
  payThroughPlatform: boolean;
}): JobBreakdown {
  const { serviceAmount: S, isRecurring, payThroughPlatform } = params;
  const pct = isRecurring ? 0.01 : 0.1; // customer/provider percentage per side

  // Cash recurring → job is NOT charged online; only tokens apply elsewhere.
  if (isRecurring && !payThroughPlatform) {
    return {
      service_amount: S,
      is_recurring: true,
      pay_through_platform: false,
      stripe_fee: 0,
      fee_half: 0,
      customer_fee: 0,
      provider_fee: 0,
      customer_charge: 0,
      provider_payout: 0,
      application_fee: 0,
      platform_net: 0,
      cash_amount: S,
    };
  }

  const customerFeePct = round2(S * pct);
  const providerFeePct = round2(S * pct);
  const base = S + customerFeePct; // customer net before Stripe fee (275 or 252.5)
  const fee = estimateStripeFee(base);
  const feeHalf = round2(fee / 2);

  const customerCharge = round2(S + customerFeePct + feeHalf);
  const providerPayout = round2(S - providerFeePct - feeHalf);
  const applicationFee = round2(customerCharge - providerPayout); // = 2·pct·S + fee
  const platformNet = round2(applicationFee - fee); // = 2·pct·S (exact)

  return {
    service_amount: S,
    is_recurring: isRecurring,
    pay_through_platform: true,
    stripe_fee: fee,
    fee_half: feeHalf,
    customer_fee: customerFeePct,
    provider_fee: providerFeePct,
    customer_charge: customerCharge,
    provider_payout: providerPayout,
    application_fee: applicationFee,
    platform_net: platformNet,
    cash_amount: 0,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Current billing period key, e.g. "2026-07". */
export function currentPeriod(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

// ═══════════════════════════════════════════════════════════════════════════
//  CONNECT — provider onboarding (Express accounts + Account Links)
// ═══════════════════════════════════════════════════════════════════════════

/** Create (or reuse) an Express connected account for a provider. */
export async function ensureConnectAccount(params: {
  existingAccountId?: string | null;
  email?: string | null;
  country?: string | null;
  businessName?: string | null;
  providerId: string;
}): Promise<string> {
  const stripe = getStripe();
  if (params.existingAccountId) return params.existingAccountId;

  const account = await stripe.accounts.create({
    type: "express",
    country: resolveCountry(params.country),
    email: params.email || undefined,
    business_type: "individual",
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    business_profile: {
      name: params.businessName || undefined,
      product_description: "Home services provided via HelpersHob",
    },
    metadata: { provider_id: params.providerId },
  });

  logger.info("Stripe Express account created", {
    providerId: params.providerId,
    accountId: account.id,
  });
  return account.id;
}

/** Build a hosted onboarding link the provider opens (in a WebView). */
export async function createAccountLink(accountId: string): Promise<string> {
  const stripe = getStripe();
  const link = await stripe.accountLinks.create({
    account: accountId,
    // The RN WebView intercepts any navigation to /bank-details, closes, and
    // re-checks status via /providers/stripe-status (same pattern as Mollie).
    refresh_url: `${APP_URL}/bank-details?status=refresh&provider=stripe&account_id=${accountId}`,
    return_url: `${APP_URL}/bank-details?status=return&provider=stripe&account_id=${accountId}`,
    type: "account_onboarding",
  });
  return link.url;
}

export interface ConnectStatus {
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  status: "not_started" | "pending" | "active";
}

/** Read the live status of a connected account. */
export async function getAccountStatus(
  accountId: string,
): Promise<ConnectStatus> {
  const stripe = getStripe();
  const acct = await stripe.accounts.retrieve(accountId);
  const charges = acct.charges_enabled === true;
  const payouts = acct.payouts_enabled === true;
  const submitted = acct.details_submitted === true;
  return {
    charges_enabled: charges,
    payouts_enabled: payouts,
    details_submitted: submitted,
    status: charges ? "active" : submitted ? "pending" : "not_started",
  };
}

// ═══════════════════════════════════════════════════════════════════════════
//  CUSTOMERS + SAVED CARDS (platform customer, SetupIntent, off-session)
// ═══════════════════════════════════════════════════════════════════════════

/** Create or reuse a platform Customer for an app user (customer OR provider). */
export async function ensureCustomer(params: {
  existingCustomerId?: string | null;
  userId: string;
  name?: string | null;
  email?: string | null;
}): Promise<string> {
  const stripe = getStripe();
  if (params.existingCustomerId) return params.existingCustomerId;
  const customer = await stripe.customers.create({
    name: params.name || undefined,
    email: params.email || undefined,
    metadata: { user_id: params.userId },
  });
  return customer.id;
}

/**
 * Create a SetupIntent so the client can save a card off-session. Returns the
 * pieces the mobile client needs (client secret; publishable key comes from
 * env on the client). Used by the "add card" flow.
 */
export async function createSetupIntent(customerId: string) {
  const stripe = getStripe();
  const intent = await stripe.setupIntents.create({
    customer: customerId,
    usage: "off_session",
    payment_method_types: ["card"],
  });
  return { client_secret: intent.client_secret, id: intent.id };
}

/**
 * Hosted Checkout Session in `setup` mode — lets the user save a card in a
 * WebView (no native SDK). The saved card is attached to the customer and set
 * as their default for future off-session charges.
 */
export async function createSetupCheckoutSession(params: {
  customerId: string;
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
}): Promise<{ id: string; url: string | null }> {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "setup",
    customer: params.customerId,
    payment_method_types: ["card"],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    metadata: params.metadata,
  });
  return { id: session.id, url: session.url };
}

/** Set a saved card as the customer's default payment method. */
export async function setDefaultPaymentMethod(
  customerId: string,
  paymentMethodId: string,
): Promise<void> {
  const stripe = getStripe();
  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: paymentMethodId },
  });
}

export interface SavedCard {
  id: string; // payment method id (pm_…)
  brand: string;
  last4: string;
  exp_month: number;
  exp_year: number;
  is_default: boolean;
}

/** List a customer's saved cards. */
export async function listSavedCards(
  customerId: string,
): Promise<SavedCard[]> {
  const stripe = getStripe();
  const [methods, customer] = await Promise.all([
    stripe.paymentMethods.list({ customer: customerId, type: "card" }),
    stripe.customers.retrieve(customerId),
  ]);
  const defaultPm =
    typeof customer !== "string" && !("deleted" in customer)
      ? (customer.invoice_settings?.default_payment_method as string | null)
      : null;
  return methods.data.map((m: Stripe.PaymentMethod) => ({
    id: m.id,
    brand: m.card?.brand || "card",
    last4: m.card?.last4 || "••••",
    exp_month: m.card?.exp_month || 0,
    exp_year: m.card?.exp_year || 0,
    is_default: m.id === defaultPm,
  }));
}

/** Detach (delete) a saved card. */
export async function detachCard(paymentMethodId: string): Promise<void> {
  const stripe = getStripe();
  await stripe.paymentMethods.detach(paymentMethodId);
}

/** The customer's default saved payment method id, if any. */
export async function getDefaultPaymentMethod(
  customerId: string,
): Promise<string | null> {
  const stripe = getStripe();
  const customer = await stripe.customers.retrieve(customerId);
  if (typeof customer === "string" || "deleted" in customer) return null;
  const def = customer.invoice_settings?.default_payment_method;
  if (def) return typeof def === "string" ? def : def.id;
  // Fall back to the most recently attached card.
  const methods = await stripe.paymentMethods.list({
    customer: customerId,
    type: "card",
    limit: 1,
  });
  return methods.data[0]?.id ?? null;
}

// ═══════════════════════════════════════════════════════════════════════════
//  CHARGES
// ═══════════════════════════════════════════════════════════════════════════

export interface DestinationChargeParams {
  amountEuros: number; // total charged to customer
  applicationFeeEuros: number; // platform cut (incl. its share of Stripe fee)
  destinationAccountId: string; // provider connected account
  customerId: string;
  paymentMethodId?: string; // saved card → off-session confirm
  description: string;
  metadata: Record<string, string>;
  idempotencyKey?: string;
}

/**
 * Charge a saved card immediately (off-session) with a destination transfer to
 * the provider. Returns the PaymentIntent. If the card needs authentication
 * (SCA), the caller should fall back to a Checkout Session.
 */
export async function chargeSavedCardDestination(
  params: DestinationChargeParams,
): Promise<Stripe.PaymentIntent> {
  const stripe = getStripe();
  return stripe.paymentIntents.create(
    {
      amount: toCents(params.amountEuros),
      currency: "eur",
      customer: params.customerId,
      payment_method: params.paymentMethodId,
      off_session: true,
      confirm: true,
      description: params.description,
      application_fee_amount: toCents(params.applicationFeeEuros),
      on_behalf_of: params.destinationAccountId,
      transfer_data: { destination: params.destinationAccountId },
      metadata: params.metadata,
    },
    params.idempotencyKey ? { idempotencyKey: params.idempotencyKey } : undefined,
  );
}

/**
 * Create a hosted Checkout Session for a job payment (new card). Splits to the
 * provider via payment_intent_data and saves the card for future off-session
 * charges (setup_future_usage). Returns { id, url }.
 */
export async function createJobCheckoutSession(params: {
  amountEuros: number;
  applicationFeeEuros: number;
  destinationAccountId: string;
  customerId: string;
  description: string;
  metadata: Record<string, string>;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ id: string; url: string | null }> {
  const stripe = getStripe();
  
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer: params.customerId,
    line_items: [
      {
        price_data: {
          currency: "eur",
          product_data: { name: params.description },
          unit_amount: toCents(params.amountEuros),
        },
        quantity: 1,
      },
    ],
    payment_intent_data: {
      application_fee_amount: toCents(params.applicationFeeEuros),
      on_behalf_of: params.destinationAccountId,
      transfer_data: { destination: params.destinationAccountId },
      setup_future_usage: "off_session",
      metadata: params.metadata,
    },
    // Also persist the card on the customer for later off-session token charges.
    saved_payment_method_options: { payment_method_save: "enabled" } as any,
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    metadata: params.metadata,
  });
  return { id: session.id, url: session.url };
}

/**
 * Charge a platform-only amount off-session (no transfer) — used for the
 * monthly tokens (€15 customer / €5 provider). 100% stays with the platform.
 */
export async function chargePlatformOffSession(params: {
  amountEuros: number;
  customerId: string;
  paymentMethodId: string;
  description: string;
  metadata: Record<string, string>;
  idempotencyKey?: string;
}): Promise<Stripe.PaymentIntent> {
  const stripe = getStripe();
  return stripe.paymentIntents.create(
    {
      amount: toCents(params.amountEuros),
      currency: "eur",
      customer: params.customerId,
      payment_method: params.paymentMethodId,
      off_session: true,
      confirm: true,
      description: params.description,
      metadata: params.metadata,
    },
    params.idempotencyKey ? { idempotencyKey: params.idempotencyKey } : undefined,
  );
}

/**
 * Hosted Checkout Session for a platform-only token charge (new card fallback).
 */
export async function createTokenCheckoutSession(params: {
  amountEuros: number;
  customerId: string;
  description: string;
  metadata: Record<string, string>;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ id: string; url: string | null }> {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer: params.customerId,
    line_items: [
      {
        price_data: {
          currency: "eur",
          product_data: { name: params.description },
          unit_amount: toCents(params.amountEuros),
        },
        quantity: 1,
      },
    ],
    payment_intent_data: {
      setup_future_usage: "off_session",
      metadata: params.metadata,
    },
    saved_payment_method_options: { payment_method_save: "enabled" } as any,
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    metadata: params.metadata,
  });
  return { id: session.id, url: session.url };
}

/** Verify + parse a Stripe webhook event using the signing secret. */
export function constructWebhookEvent(
  payload: string | Buffer,
  signature: string,
): Stripe.Event {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
  return stripe.webhooks.constructEvent(payload, signature, secret);
}

/** Pull the actual Stripe fee (euros) from a PaymentIntent's balance txn. */
export async function getActualFeeFromPaymentIntent(
  paymentIntentId: string,
): Promise<number | null> {
  const stripe = getStripe();
  const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
    expand: ["latest_charge.balance_transaction"],
  });
  const charge = pi.latest_charge as Stripe.Charge | null;
  const bt = charge?.balance_transaction as Stripe.BalanceTransaction | null;
  if (bt && typeof bt !== "string") return toEuros(bt.fee);
  return null;
}

/** ISO 3166-1 alpha-2 country for Stripe; default NL. */
function resolveCountry(country?: string | null): string {
  if (country && /^[A-Za-z]{2}$/.test(country.trim())) {
    return country.trim().toUpperCase();
  }
  return process.env.STRIPE_DEFAULT_COUNTRY?.toUpperCase() || "NL";
}
