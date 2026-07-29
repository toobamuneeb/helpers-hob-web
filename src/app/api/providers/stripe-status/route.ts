// GET: Check a provider's Stripe Connect onboarding status (live from Stripe)
// and persist any change so payment routing sees fresh values.
import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getAccountStatus } from "@/lib/stripe";

export const GET = async (request: NextRequest) => {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ success: false, error: "Unauthorized" }, 401);
    }
    const token = authHeader.slice(7);
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return json({ success: false, error: "Unauthorized - invalid token" }, 401);
    }

    const { data: bank } = await supabaseAdmin
      .from("provider_bank_details")
      .select("stripe_account_id, stripe_onboarding_status")
      .eq("provider_id", user.id)
      .maybeSingle();

    if (!bank?.stripe_account_id) {
      return json({
        success: true,
        connected: false,
        status: "not_started",
        can_receive_payments: false,
        can_receive_settlements: false,
        bank_verified: false,
        message: "Not connected to Stripe yet",
      });
    }

    const status = await getAccountStatus(bank.stripe_account_id);

    // Persist any change.
    if (status.status !== bank.stripe_onboarding_status) {
      await supabaseAdmin
        .from("provider_bank_details")
        .update({
          stripe_onboarding_status: status.status,
          stripe_charges_enabled: status.charges_enabled,
          stripe_payouts_enabled: status.payouts_enabled,
          stripe_details_submitted: status.details_submitted,
          bank_verified: status.payouts_enabled,
          // keep the legacy 'active' flag in sync so any old checks still pass
          mollie_connect_status: status.charges_enabled ? "active" : "pending",
          updated_at: new Date().toISOString(),
        })
        .eq("provider_id", user.id);
    }

    return json({
      success: true,
      connected: true,
      status: status.status,
      can_receive_payments: status.charges_enabled,
      can_receive_settlements: status.payouts_enabled,
      stripe_account_id: bank.stripe_account_id,
      bank_verified: status.payouts_enabled,
      details_submitted: status.details_submitted,
      message:
        status.status === "active"
          ? "Your Stripe account is active. You can receive payouts."
          : status.details_submitted
            ? "Your details are being verified by Stripe."
            : "Finish your Stripe onboarding to receive payouts.",
    });
  } catch (error: any) {
    return json({ error: "Failed to check status", details: error.message }, 500);
  }
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
