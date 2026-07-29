// POST /api/payments/customer-token
// Charge the customer's €15 monthly subscription token after user confirmation.
// Similar to provider payment flow - user selects card and confirms.
// Body: { offer_id, payment_method_id? }
import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { z } from "zod";
import { validateRequest } from "@/lib/validation";
import logger from "@/lib/logger";
import {
  APP_URL,
  MONTHLY_TOKEN_CUSTOMER,
  currentPeriod,
  ensureCustomer,
  chargePlatformOffSession,
  createTokenCheckoutSession,
} from "@/lib/stripe";

const schema = z.object({
  offer_id: z.string().uuid(),
  payment_method_id: z.string().optional(), // Saved card PM ID
});

export const POST = requireAuth(async (request: NextRequest, user) => {
  const v = validateRequest(schema, await request.json());
  if (!v.success) return json({ error: v.error }, 400);

  try {
    const { offer_id, payment_method_id } = v.data;
    const period = currentPeriod();

    // Get/create Stripe customer
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("stripe_customer_id, name, email")
      .eq("user_id", user.id)
      .single();

    const customerId = await ensureCustomer({
      existingCustomerId: profile?.stripe_customer_id,
      userId: user.id,
      name: profile?.name,
      email: profile?.email,
    });
    if (customerId !== profile?.stripe_customer_id) {
      await supabaseAdmin
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("user_id", user.id);
    }

    // Check if already paid this month
    const { data: rec } = await supabaseAdmin.rpc("record_token_payment", {
      p_user_id: user.id,
      p_offer_id: offer_id,
      p_period: period,
      p_amount: MONTHLY_TOKEN_CUSTOMER,
      p_kind: "customer_token",
    });

    if (rec?.already_paid) {
      return json({
        success: true,
        status: "already_paid",
        instant: true,
        paymentId: rec.payment_id,
      });
    }

    const tokenPaymentId: string = rec.payment_id;
    const metadata = {
      user_id: user.id,
      offer_id: offer_id,
      payment_id: tokenPaymentId,
      payment_kind: "customer_token",
      period,
    };

    // User selected a saved card - charge it
    if (payment_method_id) {
      logger.info("Charging customer token with selected card", {
        customerId: user.id,
        paymentMethodId: payment_method_id,
      });

      const pi = await chargePlatformOffSession({
        amountEuros: MONTHLY_TOKEN_CUSTOMER,
        customerId,
        paymentMethodId: payment_method_id,
        description: `HelpersHob customer monthly token (${period})`,
        metadata,
        idempotencyKey: `ctok_${tokenPaymentId}`,
      });

      await supabaseAdmin.rpc("update_stripe_payment_status", {
        p_payment_id: tokenPaymentId,
        p_stripe_status: pi.status,
        p_payment_intent_id: pi.id,
        p_charge_id: (pi.latest_charge as string) ?? null,
      });

      return json({
        success: true,
        status: "charged",
        instant: pi.status === "succeeded",
        paymentId: tokenPaymentId,
        stripe_payment_intent_id: pi.id,
      });
    }

    // No card selected - return Checkout URL for new card
    logger.info("Creating checkout for customer token (new card)", {
      customerId: user.id,
    });

    const session = await createTokenCheckoutSession({
      amountEuros: MONTHLY_TOKEN_CUSTOMER,
      customerId,
      description: `HelpersHob customer monthly token (${period})`,
      metadata,
      successUrl: `${APP_URL}/payment/success?payment_id=${tokenPaymentId}&type=token`,
      cancelUrl: `${APP_URL}/payment/cancel?payment_id=${tokenPaymentId}&type=token`,
    });

    await supabaseAdmin
      .from("payments")
      .update({
        stripe_checkout_session_id: session.id,
        mollie_checkout_url: session.url,
      })
      .eq("payment_id", tokenPaymentId);

    return json({
      success: true,
      status: "pending_checkout",
      instant: false,
      checkoutUrl: session.url,
      paymentId: tokenPaymentId,
    });
  } catch (error: any) {
    logger.error("customer-token failed", {
      userId: user.id,
      error: error.message,
    });
    return json(
      { error: "Failed to charge customer token", details: error.message },
      500
    );
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
