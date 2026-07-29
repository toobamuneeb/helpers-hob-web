// TEST ENDPOINT - Manually charge customer token (for testing without webhook)
// POST /api/payments/test-token
import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import logger from "@/lib/logger";
import {
  MONTHLY_TOKEN_CUSTOMER,
  currentPeriod,
  getDefaultPaymentMethod,
  chargePlatformOffSession,
} from "@/lib/stripe";
import { z } from "zod";
import { validateRequest } from "@/lib/validation";

const schema = z.object({
  offer_id: z.string().uuid(),
});

export const POST = requireAuth(async (request: NextRequest, user) => {
  const v = validateRequest(schema, await request.json());
  if (!v.success) return json({ error: v.error }, 400);

  try {
    const { offer_id } = v.data;
    const period = currentPeriod();

    // Get customer's Stripe info
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("stripe_customer_id, stripe_default_payment_method")
      .eq("user_id", user.id)
      .single();

    if (!profile?.stripe_customer_id) {
      return json({ error: "No Stripe customer found" }, 400);
    }

    const customerId = profile.stripe_customer_id;
    const savedPm = await getDefaultPaymentMethod(customerId);

    if (!savedPm) {
      return json({ error: "No saved payment method found" }, 400);
    }

    // Check if token already paid
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
        message: "Token already paid this month",
        paymentId: rec.payment_id,
      });
    }

    const tokenPaymentId = rec.payment_id;

    // Charge token
    logger.info("TEST: Charging customer token", {
      userId: user.id,
      offerId: offer_id,
      period,
      tokenPaymentId,
    });

    const pi = await chargePlatformOffSession({
      amountEuros: MONTHLY_TOKEN_CUSTOMER,
      customerId,
      paymentMethodId: savedPm,
      description: `HelpersHob monthly token (${period}) - TEST`,
      metadata: {
        user_id: user.id,
        offer_id: offer_id,
        payment_id: tokenPaymentId,
        payment_kind: "customer_token",
        period,
      },
      idempotencyKey: `ctok_test_${tokenPaymentId}`,
    });

    // Update payment status
    await supabaseAdmin.rpc("update_stripe_payment_status", {
      p_payment_id: tokenPaymentId,
      p_stripe_status: pi.status,
      p_payment_intent_id: pi.id,
      p_charge_id: (pi.latest_charge as string) ?? null,
    });

    return json({
      success: true,
      message: "Token charged successfully",
      paymentId: tokenPaymentId,
      amount: MONTHLY_TOKEN_CUSTOMER,
      status: pi.status,
    });
  } catch (error: any) {
    logger.error("Test token charge failed", {
      userId: user.id,
      error: error.message,
    });
    return json(
      { error: "Failed to charge token", details: error.message },
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
