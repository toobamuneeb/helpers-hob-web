// POST /api/payments/add-card
// Returns a hosted Stripe Checkout (setup mode) URL so the user can save a card
// in a WebView. Works for both customers and providers (provider needs a card
// on file for the €5 monthly subscription token).
import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { ensureCustomer, createSetupCheckoutSession, APP_URL } from "@/lib/stripe";
import logger from "@/lib/logger";

export const POST = requireAuth(async (request: NextRequest, user) => {
  try {
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

    const session = await createSetupCheckoutSession({
      customerId,
      successUrl: `${APP_URL}/payment/success?type=card`,
      cancelUrl: `${APP_URL}/payment/cancel?type=card`,
      metadata: { user_id: user.id, kind: "add_card" },
    });

    logger.info("Setup checkout session created", { userId: user.id });
    return json({ success: true, checkout_url: session.url, session_id: session.id });
  } catch (error: any) {
    logger.error("add-card failed", { userId: user.id, error: error.message });
    return json({ error: "Failed to start card setup", details: error.message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
