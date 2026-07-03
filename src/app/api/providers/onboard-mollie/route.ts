// POST: Generate Mollie Connect OAuth URL for provider
import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { createProviderOnboarding } from "@/lib/mollie";
import logger from "@/lib/logger";

export const POST = requireRole("service_provider")(async (
  request: NextRequest,
  user,
) => {
  try {
    // Get provider profile (country is used to pre-fill Mollie onboarding)
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("name, email, country")
      .eq("user_id", user.id)
      .single();

    if (!profile) {
      return new Response(JSON.stringify({ error: "Profile not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Always generate a fresh onboarding URL (even if already connected) so "Reconnect / Change Account" works — re-authorize, switch account, or grant new scopes; Client Links pre-fills provider details (OAuth fallback).
    const onboarding = await createProviderOnboarding({
      providerId: user.id,
      name: profile.name || "Provider",
      email: profile.email,
      country: profile.country,
      businessName: profile.name,
    });

    logger.info("Onboarding URL generated for provider", {
      userId: user.id,
      mode: onboarding.mode,
      hasOnboardingUrl: !!onboarding.onboardingUrl,
    });

    return new Response(
      JSON.stringify({
        success: true,
        onboarding_url: onboarding.onboardingUrl,
        mode: onboarding.mode,
        message: "Connect your Mollie account to receive payouts",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error: any) {
    console.error("Provider onboarding error:", error);
    logger.error("Provider onboarding failed", {
      userId: user.id,
      error: error.message,
    });

    return new Response(
      JSON.stringify({
        error: "Failed to generate OAuth URL",
        details: error.message,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
});
