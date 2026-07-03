// POST: Create payment for job completion
import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { rateLimitMiddleware } from "@/lib/rate-limiter";
import { createPayment, createOrGetCustomer } from "@/lib/mollie";
import logger from "@/lib/logger";
import { z } from "zod";
import { validateRequest } from "@/lib/validation";

const createPaymentSchema = z.object({
  offer_id: z.string().uuid(),
  mandate_id: z.string().optional(), // Optional: saved payment method ID
});

export const POST = requireAuth(async (request: NextRequest, user) => {
  const rl = await rateLimitMiddleware("payment")(request);
  if (rl) return rl;

  const body = await request.json();
  const v = validateRequest(createPaymentSchema, body);
  if (!v.success) {
    return new Response(JSON.stringify({ error: v.error }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { data: offer, error: offerError } = await supabaseAdmin
      .from("job_offers")
      .select(
        "offer_id, payment_amount, pay_through_platform, is_recurring, offer_status, customer_id, provider_id, payment_id",
      )
      .eq("offer_id", v.data.offer_id)
      .eq("customer_id", user.id)
      .single();

    if (offerError || !offer) {
      return new Response(JSON.stringify({ error: "Offer not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Check if payment already exists for this offer
    if (offer.payment_id) {
      // Get existing payment details
      const { data: existingPayment } = await supabaseAdmin
        .from("payments")
        .select("payment_id, mollie_checkout_url, payment_status")
        .eq("payment_id", offer.payment_id)
        .single();

      if (existingPayment?.mollie_checkout_url) {
        return new Response(
          JSON.stringify({
            success: true,
            payment_id: existingPayment.payment_id,
            checkout_url: existingPayment.mollie_checkout_url,
            existing: true,
            message: "Using existing payment",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
    }

    if (offer.offer_status !== "awaiting_confirmation") {
      return new Response(
        JSON.stringify({ error: "Offer not ready for payment" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Calculate breakdown
    const { data: breakdown, error: calcError } = await supabaseAdmin.rpc(
      "calculate_payment_breakdown",
      {
        p_service_amount: offer.payment_amount,
        p_pay_through_platform: offer.pay_through_platform,
        p_is_recurring: offer.is_recurring,
      },
    );

    if (calcError || !breakdown) {
      return new Response(
        JSON.stringify({ error: "Failed to calculate payment" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // STEP 2: Get or create Mollie customer BEFORE creating payment
    const host = request.headers.get("host");
    const protocol =
      request.headers.get("x-forwarded-proto") ||
      (host?.includes("localhost") ? "http" : "https");
    const baseUrl = `${protocol}://${host}`;

    console.log("🌐 Base URL detected:", baseUrl);

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("mollie_customer_id, name, email")
      .eq("user_id", user.id)
      .single();

    let customerId = profile?.mollie_customer_id;

    // Create Mollie customer if doesn't exist
    if (!customerId && profile) {
      const mollieCustomer = await createOrGetCustomer({
        userId: user.id,
        name: profile.name || "Customer",
        email: profile.email || `user_${user.id}@helpershob.com`,
      });

      customerId = mollieCustomer.id;

      // Save customer ID to database
      await supabaseAdmin
        .from("profiles")
        .update({ mollie_customer_id: customerId })
        .eq("user_id", user.id);

      console.log("✅ Created Mollie customer:", customerId);
    }

    // STEP 3: Split payment routing (Marketplaces model). The payment is created
    // on the PLATFORM account and split to the provider's connected org via
    // routing. Saved cards therefore live on the platform account and work
    // across every provider (safe: providers can't charge the card themselves).
    let routing:
      | Array<{
          amount: { currency: string; value: string };
          destination: { type: string; organizationId: string };
        }>
      | undefined;
    let splitPaymentEnabled = false;

    // ONLY for platform payments. If pay_through_platform = FALSE the customer

    if (offer.pay_through_platform) {
      const { data: bankDetails } = await supabaseAdmin
        .from("provider_bank_details")
        .select("mollie_connect_id, mollie_connect_status, bank_verified")
        .eq("provider_id", offer.provider_id)
        .single();

      console.log("🔵 Provider bank details:", bankDetails);

      const isRealOrgId =
        bankDetails?.mollie_connect_id &&
        !bankDetails.mollie_connect_id.startsWith("org_manual_") &&
        !bankDetails.mollie_connect_id.startsWith("org_pending_");

      const isTestMode = process.env.MOLLIE_API_KEY?.startsWith("test_");

      // In test mode, relax bank_verified (OAuth onboarding doesn't collect IBAN).
      // In live mode, require it for safety.
      const bankRequirementMet = isTestMode
        ? true
        : bankDetails?.bank_verified === true;

      console.log("🔵 Routing eligibility check:", {
        isRealOrgId,
        orgId: bankDetails?.mollie_connect_id,
        connectStatus: bankDetails?.mollie_connect_status,
        bankRequirementMet,
        isTestMode,
      });

      if (
        isRealOrgId &&
        bankDetails.mollie_connect_status === "active" &&
        bankRequirementMet
      ) {
        if (
          !process.env.MOLLIE_PLATFORM_ID ||
          process.env.MOLLIE_PLATFORM_ID === "your_platform_org_id"
        ) {
          throw new Error(
            "MOLLIE_PLATFORM_ID not configured - cannot route payments",
          );
        }

        // Route the provider's payout to THEIR connected org. The remainder
        // (platform fee) stays with the platform automatically.
        routing = [
          {
            amount: {
              currency: "EUR",
              value: parseFloat(breakdown.provider_payout).toFixed(2),
            },
            destination: {
              type: "organization",
              organizationId: bankDetails.mollie_connect_id,
            },
          },
        ];
        splitPaymentEnabled = true;

        logger.info("Split payment routing configured", {
          providerId: offer.provider_id,
          providerOrg: bankDetails.mollie_connect_id,
          providerPayout: breakdown.provider_payout,
          testMode: isTestMode,
        });
      } else if (!isRealOrgId) {
        logger.warn("Split disabled - Organization ID is manual/pending", {
          orgId: bankDetails?.mollie_connect_id,
        });
      } else if (bankDetails.mollie_connect_status !== "active") {
        logger.warn("Split disabled - Mollie connect status not active", {
          status: bankDetails.mollie_connect_status,
        });
      } else if (!bankRequirementMet) {
        logger.warn(
          "Split disabled - bank not verified (required in live mode)",
          {
            bankVerified: bankDetails.bank_verified,
          },
        );
      }
    } else {
      // pay_through_platform = FALSE — customer pays the platform fee, rest cash.
      logger.info("Cash payment mode - no split needed", {
        platformFee: breakdown.platform_revenue,
        cashAmount: breakdown.cash_amount,
      });
    }

    // STEP 4: Create database record FIRST to get real payment ID
    const { data: paymentData, error: dbError } = await supabaseAdmin.rpc(
      "create_job_completion_payment",
      {
        p_offer_id: v.data.offer_id,
        p_customer_id: user.id,
      },
    );

    if (dbError) {
      console.error("Database error:", dbError);
      return new Response(
        JSON.stringify({
          error: "Failed to create payment record",
          details: dbError.message,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const paymentId = paymentData.payment_id;
    logger.info("Payment record created", { paymentId });

    // STEP 5: Determine charge amount based on payment type
    // Cash jobs: charge ONLY platform fee (€2)
    //
    const isPlatformPayment = offer.pay_through_platform !== false;
    const chargeAmount = isPlatformPayment
      ? parseFloat(breakdown.total_amount)
      : parseFloat(breakdown.platform_revenue); // Platform fee only (€2)

    console.log("💰 Charge amount calculated:", {
      isPlatformPayment,
      chargeAmount,
      totalAmount: breakdown.total_amount,
      platformFee: breakdown.platform_revenue,
      cashAmount: breakdown.cash_amount,
    });

    // STEP 6: Create Mollie payment - SPLIT LOGIC for saved card vs new card
    const isTestMode = process.env.MOLLIE_API_KEY?.startsWith("test_");

    // Saved card = platform-account mandate. Works for every provider because
    // the payment is created on the platform account (routing splits to provider).
    if (v.data.mandate_id) {
      // ==================== SAVED CARD FLOW ====================
      // Use saved payment method - NO CHECKOUT URL, charges directly
      logger.info("Using saved payment method", {
        mandateId: v.data.mandate_id,
        customerId,
      });

      const molliePayment = await createPayment({
        amount: { currency: "EUR", value: chargeAmount.toFixed(2) },
        description: `HelpersHob Job Payment`,
        redirectUrl: `${baseUrl}/payment/processing?payment_id=${paymentId}&offer_id=${v.data.offer_id}`,
        webhookUrl: `${baseUrl}/api/payments/webhook`,
        customerId,
        mandateId: v.data.mandate_id, // saved card (platform account)
        routing,
        metadata: {
          offer_id: v.data.offer_id,
          customer_id: user.id,
          provider_id: offer.provider_id,
          payment_id: paymentId,
          testmode: isTestMode,
        },
      });

      logger.info("Mollie payment created with saved card", {
        mollieId: molliePayment.id,
        status: molliePayment.status,
      });

      // If payment is already paid, use update_payment_status RPC to mark job complete (Webhooks don't fire for recurring/saved card payments)
      if (molliePayment.status === "paid") {
        logger.info(
          "Payment instantly paid - updating status and completing job",
          {
            paymentId,
            mollieId: molliePayment.id,
          },
        );

        const { error: updateError } = await supabaseAdmin.rpc(
          "update_payment_status",
          {
            p_payment_id: paymentId,
            p_mollie_status: "paid",
            p_mollie_payment_id: molliePayment.id,
            p_mollie_metadata: molliePayment.metadata || null,
          },
        );

        if (updateError) {
          logger.error("Failed to update payment status", {
            paymentId,
            mollieId: molliePayment.id,
            error: updateError.message,
          });
          // Don't fail - payment was created, manual intervention can fix status
        } else {
          logger.info("✅ Payment marked as paid and job completed", {
            paymentId,
            mollieId: molliePayment.id,
          });
        }
      } else {
        // Payment pending - just update Mollie ID (webhook will handle completion)
        const { error: updateError } = await supabaseAdmin
          .from("payments")
          .update({
            mollie_payment_id: molliePayment.id,
            mollie_status: molliePayment.status,
            payment_status: "pending",
          })
          .eq("payment_id", paymentId);

        if (updateError) {
          logger.error("Failed to update payment with Mollie ID", {
            paymentId,
            mollieId: molliePayment.id,
            error: updateError.message,
          });
        }
      }

      // Return success WITHOUT checkout URL (card charged directly)
      return new Response(
        JSON.stringify({
          success: true,
          payment_id: paymentId,
          mollie_payment_id: molliePayment.id,
          status: molliePayment.status,
          amount: chargeAmount, // Amount actually charged
          breakdown: {
            service_amount: breakdown.service_amount,
            customer_fee: breakdown.customer_fee,
            provider_fee: breakdown.provider_fee,
            total_amount: breakdown.total_amount,
            cash_amount: breakdown.cash_amount || 0,
            provider_payout: breakdown.provider_payout,
            platform_revenue: breakdown.platform_revenue,
            charge_amount: chargeAmount, // NEW: actual Mollie charge
          },
          split_payment_enabled: splitPaymentEnabled,
          saved_card_used: true,
          pay_through_platform: offer.pay_through_platform,
          cash_amount: breakdown.cash_amount || 0,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    } else {
      // ==================== NEW CARD FLOW ====================
      // Create checkout - customer will enter card details
      logger.info("Creating new payment checkout");

      const molliePayment = await createPayment({
        amount: { currency: "EUR", value: chargeAmount.toFixed(2) },
        description: `HelpersHob Job Payment`,
        redirectUrl: `${baseUrl}/payment/processing?payment_id=${paymentId}&offer_id=${v.data.offer_id}`,
        webhookUrl: `${baseUrl}/api/payments/webhook`,
        customerId,
        routing, // split provider's payout to their org
        metadata: {
          offer_id: v.data.offer_id,
          customer_id: user.id,
          provider_id: offer.provider_id,
          payment_id: paymentId,
          testmode: isTestMode,
        },
      });

      logger.info("Mollie payment created with checkout", {
        mollieId: molliePayment.id,
        hasCheckoutUrl: !!molliePayment.checkoutUrl,
        routing: !!routing,
      });

      // Update payment record with Mollie details
      const { error: updateError } = await supabaseAdmin
        .from("payments")
        .update({
          mollie_payment_id: molliePayment.id,
          mollie_checkout_url: molliePayment.checkoutUrl,
          mollie_status: molliePayment.status,
          expires_at: molliePayment.expiresAt,
        })
        .eq("payment_id", paymentId);

      if (updateError) {
        logger.error("Failed to update payment with Mollie details", {
          paymentId,
          error: updateError.message,
        });
      }

      // Return checkout URL for customer to complete payment
      return new Response(
        JSON.stringify({
          success: true,
          payment_id: paymentId,
          checkout_url: molliePayment.checkoutUrl,
          amount: chargeAmount, // Amount actually charged
          breakdown: {
            service_amount: breakdown.service_amount,
            customer_fee: breakdown.customer_fee,
            provider_fee: breakdown.provider_fee,
            total_amount: breakdown.total_amount,
            cash_amount: breakdown.cash_amount || 0,
            provider_payout: breakdown.provider_payout,
            platform_revenue: breakdown.platform_revenue,
            charge_amount: chargeAmount, // NEW: actual Mollie charge
          },
          split_payment_enabled: splitPaymentEnabled,
          pay_through_platform: offer.pay_through_platform,
          cash_amount: breakdown.cash_amount || 0,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  } catch (error: any) {
    console.error("Payment creation error:", error);
    logger.error("Payment creation failed", {
      userId: user.id,
      error: error.message,
    });

    return new Response(
      JSON.stringify({
        error: "Failed to create payment",
        details: error.message,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
});
