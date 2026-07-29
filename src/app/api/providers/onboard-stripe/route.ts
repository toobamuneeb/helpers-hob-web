// POST: Start / resume Stripe Connect (Express) onboarding for a provider.
// Creates the connected account if needed, stores it, and returns a hosted
// Account Link the app opens in a WebView.
import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import {
  ensureConnectAccount,
  createAccountLink,
  getAccountStatus,
} from "@/lib/stripe";
import logger from "@/lib/logger";

export const POST = requireRole("service_provider")(async (
  request: NextRequest,
  user,
) => {
  try {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("name, email, country")
      .eq("user_id", user.id)
      .single();

    if (!profile) {
      return json({ error: "Profile not found" }, 404);
    }

    // Reuse an existing connected account if we already created one.
    const { data: bank } = await supabaseAdmin
      .from("provider_bank_details")
      .select("stripe_account_id")
      .eq("provider_id", user.id)
      .maybeSingle();

    const accountId = await ensureConnectAccount({
      existingAccountId: bank?.stripe_account_id,
      providerId: user.id,
      email: profile.email,
      country: profile.country,
      businessName: profile.name,
    });

    // Persist the account id (+ initial status) so payments can route to it.
    const status = await getAccountStatus(accountId);
    await supabaseAdmin.from("provider_bank_details").upsert(
      {
        provider_id: user.id,
        stripe_account_id: accountId,
        stripe_onboarding_status: status.status,
        stripe_charges_enabled: status.charges_enabled,
        stripe_payouts_enabled: status.payouts_enabled,
        stripe_details_submitted: status.details_submitted,
        bank_verified: status.payouts_enabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "provider_id" },
    );

    const onboardingUrl = await createAccountLink(accountId);

    logger.info("Stripe onboarding link generated", {
      userId: user.id,
      accountId,
      status: status.status,
    });

    return json({
      success: true,
      onboarding_url: onboardingUrl,
      account_id: accountId,
      status: status.status,
      message: "Connect your Stripe account to receive payouts",
    });
  } catch (error: any) {
    logger.error("Stripe onboarding failed", {
      userId: user.id,
      error: error.message,
    });
    return json({ error: "Failed to start onboarding", details: error.message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
