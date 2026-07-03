/**
 * Mollie Payment Integration
 * Handles payment creation, webhooks, and status updates
 */

import { createMollieClient, PaymentMethod } from "@mollie/api-client";
import logger from "./logger";
import { supabaseAdmin } from "./supabase";

// Initialize Mollie client
const mollieClient = createMollieClient({
  apiKey: process.env.MOLLIE_API_KEY || "",
});

export interface CreatePaymentParams {
  // Mollie official amount format — exact same shape as routing[].amount
  amount: {
    currency: string;
    value: string; // e.g. "52.50"
  };
  description: string;
  redirectUrl: string;
  webhookUrl?: string; // Optional for local development
  metadata?: Record<string, any>;
  customerId?: string; // Mollie customer ID for saved cards
  mandateId?: string; // Payment method/mandate ID for one-click payments
  routing?: Array<{
    // Split payment routing - Mollie official format (Marketplaces model)
    amount: {
      value: string;
      currency: string;
    };
    destination: {
      type: string;
      organizationId: string;
    };
  }>;
  // ── Connect for Platforms (applicationFee model) ──
  // When set, the payment is created ON the connected provider's account using
  // their OAuth access token, and the platform's cut is taken via applicationFee.
  // This is the correct model for "Connect for Platforms" and needs no balances.
  accessToken?: string; // provider's OAuth access token (access_...)
  profileId?: string; // provider's profile id (auto-resolved if omitted)
  applicationFee?: {
    value: string; // platform's fee, e.g. "50.10"
    description: string; // shown to the merchant, max 255 chars
  };
}

export interface PaymentResponse {
  id: string;
  status: string;
  checkoutUrl: string | null;
  amount: {
    value: string;
    currency: string;
  };
  description: string;
  metadata: any;
  createdAt: string;
  expiresAt?: string;
  customerId?: string;
}

export interface MollieCustomer {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

export interface SavedPaymentMethod {
  id: string; // mandate ID
  method: string; // 'creditcard', 'ideal', etc.
  cardHolder?: string;
  cardNumber?: string; // Last 4 digits
  cardLabel?: string; // Visa, Mastercard, etc.
  createdAt: string;
}

/**
 * Create a Mollie payment
 */
export async function createPayment(
  params: CreatePaymentParams,
): Promise<PaymentResponse> {
  try {
    // Check if API key is configured
    logger.info("Creating Mollie payment with params", {
      params,
    });
    if (
      !process.env.MOLLIE_API_KEY ||
      process.env.MOLLIE_API_KEY === "your_mollie_api_key_here"
    ) {
      throw new Error(
        "Mollie API key not configured. Please add MOLLIE_API_KEY to .env.local",
      );
    }

    const isTestMode = process.env.MOLLIE_API_KEY.startsWith("test_");

    const paymentParams: any = {
      // Pass the amount straight through in Mollie's exact { currency, value }
      // format — same shape as routing[].amount.
      amount: {
        currency: params.amount.currency,
        value: params.amount.value,
      },
      description: params.description,
      redirectUrl: params.redirectUrl,
      metadata: {
        ...params.metadata,
        testmode: isTestMode, // Flag for identifying test payments
      },
    };

    // If customer ID provided, link payment to customer (for saved cards)
    if (params.customerId) {
      paymentParams.customerId = params.customerId;
    }

    // If mandate ID provided, use it for one-click payment (SAVED CARD)
    if (params.mandateId) {
      paymentParams.mandateId = params.mandateId;
      paymentParams.sequenceType = "recurring"; // Charge saved payment method directly
      // No method array needed - uses saved mandate
      console.log("💳 Using saved payment method (recurring)");
    } else {
      // First payment - allow multiple methods and optionally save for future
      paymentParams.method = [
        PaymentMethod.ideal,
        PaymentMethod.creditcard,
        PaymentMethod.bancontact,
      ];
      if (params.customerId) {
        paymentParams.sequenceType = "first"; // Save payment method for future use
        console.log("💳 First payment - will save card");
      } else {
        paymentParams.sequenceType = "oneoff"; // Don't save
        console.log("💳 One-off payment - won't save card");
      }
    }

    // Only add webhookUrl if provided (skip for localhost)
    if (params.webhookUrl) {
      paymentParams.webhookUrl = params.webhookUrl;
    }

    // ── Connect for Platforms: create on the provider's account + applicationFee ──
    // If an accessToken is supplied we talk to Mollie AS the connected provider.
    // The full amount lands on their account; our cut is the applicationFee.
    const client = params.accessToken
      ? mollieWithToken(params.accessToken)
      : mollieClient;

    if (params.accessToken) {
      // OAuth credentials must opt into test mode explicitly.
      if (isTestMode) paymentParams.testmode = true;

      // Mollie requires a profileId when creating via an OAuth token. Resolve
      // the connected account's profile if the caller didn't pass one.
      if (params.profileId) {
        paymentParams.profileId = params.profileId;
      } else {
        try {
          const profiles = await client.profiles.page({ limit: 1 });
          if (profiles[0]?.id) paymentParams.profileId = profiles[0].id;
        } catch (e: any) {
          console.warn("⚠️ Could not resolve provider profileId:", e.message);
        }
      }

      if (params.applicationFee) {
        paymentParams.applicationFee = {
          amount: {
            currency: params.amount.currency,
            value: params.applicationFee.value,
          },
          description: params.applicationFee.description.slice(0, 255),
        };
        console.log("💸 applicationFee:", paymentParams.applicationFee);
      }
    }

    // Add routing for split payments (Marketplaces model — payment on the
    // PLATFORM account, split to the provider org). Saved cards live on the
    // platform account here, so they work across all providers.
    if (params.routing && params.routing.length > 0) {
      paymentParams.routing = params.routing;
      // NOTE: do NOT set `testmode` here. With the platform API key, test/live
      // is decided by the key itself; sending `testmode` makes Mollie reject the
      // call ("Non-existent body parameter testmode"). Only OAuth tokens use it.
      console.log(
        "💰 Payment routing enabled:",
        params.routing.length,
        "destination(s)",
      );
    }

    console.log("Creating Mollie payment:", {
      amount: paymentParams.amount,
      description: paymentParams.description,
      hasWebhook: !!params.webhookUrl,
      hasCustomer: !!params.customerId,
      hasMandateId: !!params.mandateId,
      sequenceType: paymentParams.sequenceType,
      hasRouting: !!(params.routing && params.routing.length > 0),
      testmode: isTestMode,
    });
    console.log("Payment params:", { paymentParams });
    const payment = await client.payments.create(paymentParams);

    console.log("Mollie payment created:", {
      id: payment.id,
      status: payment.status,
      checkoutUrl: payment.getCheckoutUrl(),
      customerId: payment.customerId,
      sequenceType: payment.sequenceType,
    });

    // ── SPLIT VERIFICATION ──────────────────────────────────────────────
    // Ask Mollie which routes were actually created for this payment. This is
    // the definitive "did the split happen?" check — empty list = no split.
    if (paymentParams.routing && paymentParams.routing.length > 0) {
      try {
        const routesPage = await client.paymentRoutes.page({
          paymentId: payment.id,
          testmode: isTestMode,
        } as any);
        const routes = Array.isArray(routesPage)
          ? routesPage
          : Array.from(routesPage);

        if (routes.length > 0) {
          console.log(
            `✅ SPLIT PAYMENT SUCCESSFUL — ${routes.length} route(s) created:`,
          );
          routes.forEach((r: any) => {
            console.log(
              `   → €${r.amount?.value} ${r.amount?.currency} routed to org ${r.destination?.organizationId}`,
            );
          });
        } else {
          console.warn(
            "⚠️ SPLIT NOT APPLIED — payment created but Mollie returned 0 routes. All money stayed with the platform.",
          );
        }
      } catch (verifyErr: any) {
        console.warn("⚠️ Could not verify split routes:", verifyErr.message);
      }
    } else if (params.accessToken && params.applicationFee) {
      console.log(
        `✅ CONNECTED-ACCOUNT PAYMENT — created on provider account; platform keeps applicationFee €${params.applicationFee.value}.`,
      );
    } else {
      console.log(
        "ℹ️ No split on this payment — full amount goes to the platform.",
      );
    }
    // ────────────────────────────────────────────────────────────────────

    return {
      id: payment.id,
      status: payment.status,
      checkoutUrl:
        payment.getCheckoutUrl() || payment._links?.checkout?.href || null,
      amount: payment.amount,
      description: payment.description || "",
      metadata: payment.metadata,
      createdAt: payment.createdAt,
      expiresAt: payment.expiresAt,
      customerId: payment.customerId,
    };
  } catch (error: any) {
    console.error("Mollie payment creation error:", {
      message: error.message,
      stack: error.stack,
      details: error.response?.data || error,
    });
    throw new Error(
      `Mollie payment failed: ${error.message || "Unknown error"}`,
    );
  }
}

/**
 * Get payment status from Mollie
 */
export async function getPaymentStatus(paymentId: string, accessToken?: string) {
  try {
    // applicationFee payments live on the provider's account, so they must be
    // fetched with the provider's OAuth token (+ testmode for OAuth in test).
    const client = accessToken ? mollieWithToken(accessToken) : mollieClient;
    const payment = accessToken
      ? await client.payments.get(paymentId, { testmode: isMollieTestMode() } as any)
      : await client.payments.get(paymentId);

    return {
      id: payment.id,
      status: payment.status,
      amount: payment.amount,
      description: payment.description,
      metadata: payment.metadata,
      paidAt: payment.paidAt,
      canceledAt: payment.canceledAt,
      expiredAt: payment.expiredAt,
      failedAt: payment.failedAt,
    };
  } catch (error: any) {
    console.error("Mollie get payment error:", error);
    throw new Error(`Failed to get payment status: ${error.message}`);
  }
}

/**
 * Cancel a payment
 */
export async function cancelPayment(paymentId: string) {
  try {
    await mollieClient.payments.cancel(paymentId);
    return { success: true, message: "Payment cancelled" };
  } catch (error: any) {
    console.error("Mollie cancel payment error:", error);
    throw new Error(`Failed to cancel payment: ${error.message}`);
  }
}

/**
 * Validate webhook signature (if Mollie provides one)
 * For now, we rely on payment ID verification
 */
export function validateWebhook(paymentId: string): boolean {
  // Mollie doesn't use webhook signatures, instead we verify the payment ID
  // by fetching it from their API
  return !!paymentId && paymentId.startsWith("tr_");
}

/**
 * Get the balance ID for a connected provider's organization.
 * Uses the provider's OAuth access token to fetch their balances from Mollie API.
 * Returns the first primary balance ID and its currency.
 * Required for payment routing - balanceId specifies which balance receives funds.
 */
export async function getOrganizationBalanceId(
  accessToken: string,
  organizationId: string,
): Promise<{ balanceId: string; currency: string }> {
  try {
    const response = await fetch("https://api.mollie.com/v2/balances", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ Balances API error:", {
        status: response.status,
        body: errorText,
        orgId: organizationId,
      });
      throw new Error(
        `Failed to fetch balances: ${response.status} ${errorText}`,
      );
    }

    const data = await response.json();
    console.log("🔵 Balances API response:", {
      count: data._embedded?.balances?.length || 0,
      orgId: organizationId,
    });

    // Look for primary balance or first available balance
    const balances = data._embedded?.balances || [];
    const primaryBalance = balances.find((b: any) => b.primary === true);
    const balance = primaryBalance || balances[0];

    if (!balance?.id) {
      throw new Error("No balance found for provider organization");
    }

    console.log("✅ Provider balance found:", {
      balanceId: balance.id,
      isPrimary: balance.primary,
      currency: balance.currency,
      orgId: organizationId,
    });

    return { balanceId: balance.id, currency: balance.currency };
  } catch (error: any) {
    console.error("❌ Failed to get organization balance ID:", error.message);
    throw error;
  }
}

export default mollieClient;

/**
 * Create or get Mollie customer
 * Links user to Mollie for saved payment methods
 */
export async function createOrGetCustomer(params: {
  userId: string;
  name: string;
  email: string;
}): Promise<MollieCustomer> {
  try {
    // In production, you'd store mollie_customer_id in your database
    // For now, we'll use email as identifier

    // Try to find existing customer
    const customers = await mollieClient.customers.page({ limit: 250 });
    const existingCustomer = customers.find((c) => c.email === params.email);

    if (existingCustomer) {
      console.log("Found existing Mollie customer:", existingCustomer.id);
      return {
        id: existingCustomer.id,
        name: existingCustomer.name || params.name,
        email: existingCustomer.email,
        createdAt: existingCustomer.createdAt,
      };
    }

    // Create new customer
    const customer = await mollieClient.customers.create({
      name: params.name,
      email: params.email,
      metadata: {
        user_id: params.userId,
      },
    });

    console.log("Created new Mollie customer:", customer.id);

    return {
      id: customer.id,
      name: customer.name || params.name,
      email: customer.email,
      createdAt: customer.createdAt,
    };
  } catch (error: any) {
    console.error("Error creating/getting Mollie customer:", error);
    throw new Error(`Failed to create customer: ${error.message}`);
  }
}

/**
 * Get customer's saved payment methods
 */
export async function getCustomerPaymentMethods(
  customerId: string,
): Promise<SavedPaymentMethod[]> {
  try {
    const mandates = await mollieClient.customerMandates.page({ customerId });

    return mandates
      .filter((m) => m.status === "valid") // Only valid/active payment methods
      .map((m) => {
        // Only card payments have these details
        const cardDetails =
          m.details && "cardHolder" in m.details ? m.details : null;

        return {
          id: m.id,
          method: m.method,
          cardHolder: cardDetails?.cardHolder,
          cardNumber: cardDetails?.cardNumber, // Last 4 digits
          cardLabel: cardDetails?.cardLabel
            ? String(cardDetails.cardLabel)
            : undefined, // Convert to string
          createdAt: m.createdAt,
        };
      });
  } catch (error: any) {
    console.error("Error fetching payment methods:", error);
    throw new Error(`Failed to get payment methods: ${error.message}`);
  }
}

/**
 * Delete a saved payment method
 */
export async function deletePaymentMethod(
  customerId: string,
  mandateId: string,
): Promise<void> {
  try {
    await mollieClient.customerMandates.revoke(mandateId, { customerId });
    console.log("Revoked payment method:", mandateId);
  } catch (error: any) {
    console.error("Error deleting payment method:", error);
    throw new Error(`Failed to delete payment method: ${error.message}`);
  }
}

// ════════════════════════════════════════════════════════════════════
//  MOLLIE CONNECT — Onboarding customers (platform flow)
//  Implements https://docs.mollie.com/docs/connect-platforms-onboarding-customers
//  #automating-customer-onboarding
//
//  Flow:
//   1. createProviderOnboarding → Client Links API (pre-filled data) builds a
//      redirect URL. Falls back to the OAuth Authorize URL if Client Links
//      access (MOLLIE_ORG_ACCESS_TOKEN) is not configured.
//   2. Provider verifies email / completes Mollie's onboarding wizard and
//      authorizes our app → Mollie redirects back to the callback with `code`.
//   3. Callback exchanges code→tokens, enables a profile + payment methods,
//      and reads the live onboarding status (checkProviderOnboardingStatus).
//   4. mollie-status polls the live status using the stored token (refreshed
//      automatically when expired).
// ════════════════════════════════════════════════════════════════════

const MOLLIE_OAUTH_AUTHORIZE_URL = "https://www.mollie.com/oauth2/authorize";
const MOLLIE_OAUTH_TOKEN_URL = "https://api.mollie.com/oauth2/tokens";

// Scopes granted on the PROVIDER's account when they authorize our app.
//  - onboarding.write / profiles.write: pre-fill onboarding + create profile and
//    enable payment methods on their behalf after they connect.
//  - balances/settlements/payments .read: surface their earnings in-app.
const CONNECT_SCOPES = [
  "organizations.read",
  "onboarding.read",
  "onboarding.write",
  "profiles.read",
  "profiles.write",
  "payments.read",
  "payments.write", // required to CREATE payments on the connected account (applicationFee model)
  "settlements.read",
  "balances.read",
].join(" ");

/** True when running against Mollie's test environment. */
export function isMollieTestMode(): boolean {
  return process.env.MOLLIE_API_KEY?.startsWith("test_") ?? false;
}

/** Build a Mollie client authenticated as a connected organization (OAuth). */
export function mollieWithToken(accessToken: string) {
  return createMollieClient({ accessToken });
}

/** Split a single "Given Family" string into Mollie owner name parts. */
function splitName(fullName: string): { givenName: string; familyName: string } {
  const parts = (fullName || "").trim().split(/\s+/).filter(Boolean);
  const givenName = parts[0] || "Provider";
  const familyName = parts.slice(1).join(" ") || givenName;
  return { givenName, familyName };
}

/**
 * Resolve an ISO 3166-1 alpha-2 country code for Mollie. The profiles table
 * stores free-text country, so only trust it when it already looks like a code.
 */
function resolveCountryCode(country?: string | null): string {
  if (country && /^[A-Za-z]{2}$/.test(country.trim())) {
    return country.trim().toUpperCase();
  }
  return process.env.MOLLIE_DEFAULT_COUNTRY?.toUpperCase() || "NL";
}

/**
 * Create the redirect URL that sends a provider into Mollie onboarding.
 *
 * Preferred path (per the docs' "Automating customer onboarding"): create a
 * Client Link with the provider's details pre-filled, then append the OAuth
 * params. Requires MOLLIE_ORG_ACCESS_TOKEN (an Organization Access Token with
 * `clients.write`). If that isn't configured, falls back to the standard OAuth
 * Authorize URL so existing providers can still connect.
 */
export async function createProviderOnboarding(params: {
  providerId: string;
  name: string;
  email: string;
  country?: string | null;
  businessName?: string | null;
  locale?: string | null;
}): Promise<{ onboardingUrl: string; organizationId: string; mode: string }> {
  console.log(
    "🔵 Creating Mollie Connect onboarding for provider:",
    params.providerId,
  );

  const platformId = process.env.MOLLIE_PLATFORM_ID;
  const clientId = process.env.MOLLIE_PARTNER_CLIENT_ID;
  const clientSecret = process.env.MOLLIE_PARTNER_CLIENT_SECRET;

  // Without partner credentials we cannot run Connect at all → manual signup.
  if (!clientId || !clientSecret || !platformId) {
    console.warn("⚠️ Partner credentials not configured - using MANUAL mode");
    return {
      onboardingUrl: "https://www.mollie.com/dashboard/signup",
      organizationId: `org_manual_${params.providerId.slice(0, 8)}`,
      mode: "manual",
    };
  }

  // state carries the provider id so the callback can map the result back.
  const state = params.providerId;
  const orgAccessToken = process.env.MOLLIE_ORG_ACCESS_TOKEN;

  // ── Preferred: Client Links API (automated, pre-filled onboarding) ──
  // Mollie's Client Links endpoint only works in LIVE mode, so in test mode we
  // skip it and go straight to OAuth (which works in both modes).
  if (orgAccessToken && !isMollieTestMode()) {
    try {
      const { givenName, familyName } = splitName(params.name);
      const partnerClient = mollieWithToken(orgAccessToken);

      const clientLink = await partnerClient.clientLinks.create({
        owner: {
          email: params.email,
          givenName,
          familyName,
          locale: (params.locale || process.env.MOLLIE_DEFAULT_LOCALE || "en_US") as any,
        },
        name: params.businessName || params.name || "Provider",
        address: { country: resolveCountryCode(params.country) },
      } as any);

      const onboardingUrl = clientLink.getClientLink({
        clientId,
        state,
        scope: CONNECT_SCOPES,
        // 'force': always show consent so newly added scopes are granted on
        // reconnect (with 'auto', a re-connecting provider keeps old scopes).
        approvalPrompt: "force",
      });

      logger.info("Client Link onboarding URL created", {
        providerId: params.providerId,
        scopes: CONNECT_SCOPES,
      });

      return {
        onboardingUrl,
        organizationId: `org_pending_${params.providerId.slice(0, 8)}`,
        mode: "client_link",
      };
    } catch (error: any) {
      // Don't fail onboarding if Client Links is unavailable — fall back to
      // plain OAuth below so the provider can still connect.
      logger.warn("Client Link creation failed - falling back to OAuth", {
        providerId: params.providerId,
        error: error.message,
      });
    }
  }

  // ── Fallback: standard OAuth Authorize URL ──
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/mollie/connect/callback`;
  const authorizeUrl = new URL(MOLLIE_OAUTH_AUTHORIZE_URL);
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("scope", CONNECT_SCOPES);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("approval_prompt", "force");
  // Force account selection so the provider can pick which Mollie account to link.
  authorizeUrl.searchParams.set("prompt", "login");

  logger.info("OAuth Authorize URL created", {
    providerId: params.providerId,
    scopes: CONNECT_SCOPES,
  });

  return {
    onboardingUrl: authorizeUrl.toString(),
    organizationId: `org_pending_${params.providerId.slice(0, 8)}`,
    mode: "oauth",
  };
}

/**
 * Exchange / refresh OAuth tokens with Mollie. Used by the callback (code
 * exchange) and by getValidProviderToken (refresh).
 */
async function requestMollieTokens(
  body: Record<string, string>,
): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}> {
  const clientId = process.env.MOLLIE_PARTNER_CLIENT_ID || "";
  const clientSecret = process.env.MOLLIE_PARTNER_CLIENT_SECRET || "";
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const response = await fetch(MOLLIE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Mollie token request failed (${response.status}): ${errorText}`);
  }

  return response.json();
}

/** Exchange an authorization code for an access + refresh token. */
export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
): Promise<{
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
}> {
  const tokens = await requestMollieTokens({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? null,
    expiresAt: tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null,
  };
}

/** Refresh a provider's access token and persist the rotated tokens. */
export async function refreshProviderToken(
  refreshToken: string,
  providerId: string,
): Promise<string> {
  const tokens = await requestMollieTokens({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const expiresAt = new Date(
    Date.now() + (tokens.expires_in || 3600) * 1000,
  ).toISOString();

  await supabaseAdmin
    .from("provider_bank_details")
    .update({
      mollie_access_token: tokens.access_token,
      mollie_refresh_token: tokens.refresh_token || refreshToken, // refresh token may rotate
      token_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("provider_id", providerId);

  return tokens.access_token;
}

/**
 * Return a usable access token for a connected provider, transparently
 * refreshing it when it is expired (or within 5 minutes of expiring).
 * Returns null when the provider has never connected.
 */
export async function getValidProviderToken(
  providerId: string,
): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("provider_bank_details")
    .select("mollie_access_token, mollie_refresh_token, token_expires_at")
    .eq("provider_id", providerId)
    .maybeSingle();

  if (!data?.mollie_access_token) return null;

  const expiresAt = data.token_expires_at
    ? new Date(data.token_expires_at).getTime()
    : 0;
  const expiringSoon = expiresAt - Date.now() < 5 * 60 * 1000;

  if (expiringSoon && data.mollie_refresh_token) {
    try {
      return await refreshProviderToken(data.mollie_refresh_token, providerId);
    } catch (error: any) {
      logger.warn("Token refresh failed - using stored token", {
        providerId,
        error: error.message,
      });
    }
  }

  return data.mollie_access_token;
}

/**
 * Ensure the connected provider has a payment profile with our payment methods
 * enabled, so they can accept payments as soon as onboarding allows. Best
 * effort: never throws — a method that can't be enabled yet (onboarding
 * incomplete) is skipped and reported.
 */
export async function ensureProviderProfileAndMethods(
  accessToken: string,
  details: { name?: string; email?: string; website?: string } = {},
): Promise<{ profileId: string | null; enabledMethods: string[]; warnings: string[] }> {
  const client = mollieWithToken(accessToken);
  const warnings: string[] = [];
  const enabledMethods: string[] = [];

  // Reuse an existing profile when present; Mollie usually auto-creates one.
  let profileId: string | null = null;
  try {
    const page = await client.profiles.page({ limit: 1 });
    profileId = page[0]?.id ?? null;
  } catch (error: any) {
    warnings.push(`list profiles: ${error.message}`);
  }

  if (!profileId) {
    try {
      const profile = await client.profiles.create({
        name: details.name || "HelpersHob Provider",
        website: details.website || process.env.NEXT_PUBLIC_APP_URL || "https://helpershob.com",
        email: details.email || "support@helpershob.com",
        mode: isMollieTestMode() ? "test" : "live",
      } as any);
      profileId = profile.id;
    } catch (error: any) {
      warnings.push(`create profile: ${error.message}`);
    }
  }

  if (profileId) {
    const methods: `${PaymentMethod}`[] = ["ideal", "creditcard", "bancontact"];
    for (const id of methods) {
      try {
        await client.profileMethods.enable({ profileId, id });
        enabledMethods.push(id);
      } catch (error: any) {
        // Expected in live mode until onboarding is complete.
        warnings.push(`enable ${id}: ${error.message}`);
      }
    }
  }

  return { profileId, enabledMethods, warnings };
}

export interface OnboardingStatusResult {
  status: string; // 'needs-data' | 'in-review' | 'completed'
  canReceivePayments: boolean;
  canReceiveSettlements: boolean;
  message: string;
  /** Mollie Dashboard URL where the provider can resume/complete onboarding. */
  dashboardUrl: string | null;
}

/**
 * Human-readable message matching the doc's status matrix.
 * https://docs.mollie.com/docs/connect-platforms-onboarding-customers
 */
function onboardingStatusMessage(
  status: string,
  canReceivePayments: boolean,
  canReceiveSettlements: boolean,
): string {
  if (status === "completed" && canReceivePayments && canReceiveSettlements) {
    return "Your account setup is complete. You can receive payments and settlements.";
  }
  if (canReceivePayments && !canReceiveSettlements) {
    return "You can accept payments. Add your bank details to receive settlements.";
  }
  if (status === "in-review") {
    return "Your information is being verified by Mollie. This usually takes a short while.";
  }
  return "Additional information is required to complete your Mollie onboarding.";
}

/**
 * Read the LIVE onboarding status of a connected provider using their OAuth
 * access token. Cross-checks the Onboarding API with the Capabilities API so
 * payments/settlements readiness reflects either signal.
 */
export async function checkProviderOnboardingStatus(
  accessToken: string,
): Promise<OnboardingStatusResult> {
  const client = mollieWithToken(accessToken);

  const onboarding = await client.onboarding.get();
  let canReceivePayments = onboarding.canReceivePayments;
  let canReceiveSettlements = onboarding.canReceiveSettlements;

  // Capabilities API is the doc's alternative readiness signal — merge it in.
  try {
    const capabilities = await client.capabilities.list();
    const payments = capabilities.find((c) => c.name === "payments");
    const settlements = capabilities.find((c) => c.name === "settlements");
    if (payments) canReceivePayments = canReceivePayments || payments.status === "enabled";
    if (settlements) canReceiveSettlements = canReceiveSettlements || settlements.status === "enabled";
  } catch (error: any) {
    logger.warn("Capabilities lookup failed (continuing with onboarding data)", {
      error: error.message,
    });
  }

  return {
    status: onboarding.status,
    canReceivePayments,
    canReceiveSettlements,
    message: onboardingStatusMessage(
      onboarding.status,
      canReceivePayments,
      canReceiveSettlements,
    ),
    dashboardUrl: onboarding._links?.dashboard?.href ?? null,
  };
}
