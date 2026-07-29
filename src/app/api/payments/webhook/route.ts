// POST /api/payments/webhook — Stripe signed webhook.
// Handles: checkout.session.completed, payment_intent.succeeded/failed,
// account.updated. Verifies the signature with STRIPE_WEBHOOK_SECRET.
import { NextRequest } from "next/server";
import type Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabase";
import logger from "@/lib/logger";
import {
  constructWebhookEvent,
  getStripe,
  getActualFeeFromPaymentIntent,
  setDefaultPaymentMethod,
  chargePlatformOffSession,
  MONTHLY_TOKEN_CUSTOMER,
  currentPeriod,
} from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = async (request: NextRequest) => {
  const sig = request.headers.get("stripe-signature");
  if (!sig) return new Response("Missing signature", { status: 400 });

  let event: Stripe.Event;
  try {
    const raw = await request.text(); // raw body required for signature check
    event = constructWebhookEvent(raw, sig);
  } catch (err: any) {
    logger.error("Stripe webhook signature verification failed", { error: err.message });
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case "payment_intent.succeeded":
        await handlePaymentIntent(event.data.object as Stripe.PaymentIntent, "succeeded");
        break;
      case "payment_intent.payment_failed":
        await handlePaymentIntent(event.data.object as Stripe.PaymentIntent, "failed");
        break;
      case "account.updated":
        await handleAccountUpdated(event.data.object as Stripe.Account);
        break;
      default:
        break; // ignore other events
    }
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    logger.error("Stripe webhook handler error", { type: event.type, error: error.message });
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
};

// ── checkout.session.completed ────────────────────────────────────────────
async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const stripe = getStripe();
  const userId = session.metadata?.user_id;
  const customerId =
    typeof session.customer === "string" ? session.customer : session.customer?.id;

  // Persist + default the saved card (setup OR payment with setup_future_usage).
  const savedPm = await resolveSavedPaymentMethod(session);
  if (customerId && savedPm) {
    try {
      await setDefaultPaymentMethod(customerId, savedPm);
      if (userId) {
        await supabaseAdmin
          .from("profiles")
          .update({ stripe_default_payment_method: savedPm })
          .eq("user_id", userId);
      }
    } catch (err: any) {
      logger.warn("Failed to set default PM from checkout", { error: err.message });
    }
  }

  // "Add card" setup session → nothing else to do.
  if (session.mode === "setup") return;

  // Payment session → mark the linked payment paid.
  const piId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id;
  const paymentId = session.metadata?.payment_id;
  if (!paymentId) {
    logger.warn("Checkout completed without payment_id metadata", { session: session.id });
    return;
  }

  const fee = piId ? await getActualFeeFromPaymentIntent(piId) : null;
  const charge =
    piId && (await stripe.paymentIntents.retrieve(piId)).latest_charge;
  await supabaseAdmin.rpc("update_stripe_payment_status", {
    p_payment_id: paymentId,
    p_stripe_status: "succeeded",
    p_payment_intent_id: piId ?? null,
    p_charge_id: (charge as string) ?? null,
    p_stripe_fee: fee,
  });

  // Mark job/offer as completed when payment succeeds
  const offerId = session.metadata?.offer_id;
  const tokenPaymentId = session.metadata?.token_payment_id;
  
  if (offerId && session.metadata?.payment_kind === "recurring_job") {
    logger.info("Marking offer as completed after payment", { offerId, paymentId });
    
    await supabaseAdmin
      .from("offers")
      .update({ 
        offer_status: "completed",
        updated_at: new Date().toISOString()
      })
      .eq("offer_id", offerId);
  }
  
  // Mark token as paid if it was included in the checkout
  if (tokenPaymentId) {
    await supabaseAdmin.rpc("update_stripe_payment_status", {
      p_payment_id: tokenPaymentId,
      p_stripe_status: "succeeded",
      p_payment_intent_id: piId ?? null,
      p_charge_id: (charge as string) ?? null,
    });
    logger.info("Token marked as paid from checkout", { tokenPaymentId });
  }
}

async function resolveSavedPaymentMethod(
  session: Stripe.Checkout.Session,
): Promise<string | null> {
  const stripe = getStripe();
  if (session.setup_intent) {
    const si = await stripe.setupIntents.retrieve(
      typeof session.setup_intent === "string" ? session.setup_intent : session.setup_intent.id,
    );
    return typeof si.payment_method === "string" ? si.payment_method : si.payment_method?.id ?? null;
  }
  if (session.payment_intent) {
    const pi = await stripe.paymentIntents.retrieve(
      typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent.id,
    );
    return typeof pi.payment_method === "string" ? pi.payment_method : pi.payment_method?.id ?? null;
  }
  return null;
}

async function chargeDeferredCustomerToken(
  userId: string,
  customerId: string,
  pm: string,
  offerId?: string,
) {
  const period = currentPeriod();
  const { data: rec } = await supabaseAdmin.rpc("record_token_payment", {
    p_user_id: userId,
    p_offer_id: offerId ?? null,
    p_period: period,
    p_amount: MONTHLY_TOKEN_CUSTOMER,
    p_kind: "customer_token",
  });
  if (!rec || rec.already_paid) return;
  try {
    const pi = await chargePlatformOffSession({
      amountEuros: MONTHLY_TOKEN_CUSTOMER,
      customerId,
      paymentMethodId: pm,
      description: `HelpersHob monthly token (${period})`,
      metadata: { user_id: userId, payment_id: rec.payment_id, payment_kind: "customer_token", period },
      idempotencyKey: `ctok_${rec.payment_id}`,
    });
    await supabaseAdmin.rpc("update_stripe_payment_status", {
      p_payment_id: rec.payment_id,
      p_stripe_status: pi.status,
      p_payment_intent_id: pi.id,
      p_charge_id: (pi.latest_charge as string) ?? null,
    });
  } catch (err: any) {
    logger.warn("Deferred customer token charge failed", { error: err.message });
  }
}

// ── payment_intent.succeeded / failed ─────────────────────────────────────
async function handlePaymentIntent(pi: Stripe.PaymentIntent, kind: "succeeded" | "failed") {
  const paymentId = pi.metadata?.payment_id;
  if (!paymentId) return; // not one of ours, or handled via checkout.session

  // Skip if already finalized (off-session path updates inline).
  const { data: existing } = await supabaseAdmin
    .from("payments")
    .select("payment_status")
    .eq("payment_id", paymentId)
    .maybeSingle();
  if (existing?.payment_status === "paid") return;

  const fee =
    kind === "succeeded" ? await getActualFeeFromPaymentIntent(pi.id) : null;
  await supabaseAdmin.rpc("update_stripe_payment_status", {
    p_payment_id: paymentId,
    p_stripe_status: kind === "succeeded" ? "succeeded" : "failed",
    p_payment_intent_id: pi.id,
    p_charge_id: (pi.latest_charge as string) ?? null,
    p_stripe_fee: fee,
  });
}

// ── account.updated (provider onboarding progress) ────────────────────────
async function handleAccountUpdated(account: Stripe.Account) {
  const charges = account.charges_enabled === true;
  const payouts = account.payouts_enabled === true;
  const submitted = account.details_submitted === true;
  await supabaseAdmin
    .from("provider_bank_details")
    .update({
      stripe_onboarding_status: charges ? "active" : submitted ? "pending" : "not_started",
      stripe_charges_enabled: charges,
      stripe_payouts_enabled: payouts,
      stripe_details_submitted: submitted,
      bank_verified: payouts,
      mollie_connect_status: charges ? "active" : "pending",
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_account_id", account.id);
}
