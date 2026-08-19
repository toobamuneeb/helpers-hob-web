// POST /api/payments/create
// Customer-confirmed job payment (Option B). Handles the new Stripe model:
//   • one-time (always online)            → 10% each side, 20% platform net
//   • recurring online                    → 1% each side, 2% net + €15 customer token
//   • recurring cash                      → €15 customer token only (job paid in cash)
// Provider's €5 token is charged separately at mark-complete (offers route).
//
// If the customer has a saved default card we charge off-session instantly.
// Otherwise we return a hosted Checkout URL the app opens in a WebView (which
// also saves the card for future off-session token charges).
import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { rateLimitMiddleware } from "@/lib/rate-limiter";
import { z } from "zod";
import { validateRequest } from "@/lib/validation";
import logger from "@/lib/logger";
import {
  APP_URL,
  MONTHLY_TOKEN_CUSTOMER,
  computeJobBreakdown,
  currentPeriod,
  ensureCustomer,
  getAccountStatus,
  getDefaultPaymentMethod,
  chargeSavedCardDestination,
  createJobCheckoutSession,
  chargePlatformOffSession,
  createTokenCheckoutSession,
} from "@/lib/stripe";

const schema = z.object({
  offer_id: z.string().uuid(),
  mandate_id: z.string().optional(), // kept for compatibility (unused; server picks default card)
});

export const POST = requireAuth(async (request: NextRequest, user) => {
  const rl = await rateLimitMiddleware("payment")(request);
  if (rl) return rl;

  const v = validateRequest(schema, await request.json());
  if (!v.success) return json({ error: v.error }, 400);
  
  const { offer_id, mandate_id } = v.data;
  const wantsNewCard = mandate_id === undefined; // If mandate_id undefined, user wants new card

  try {
    // ── Offer ────────────────────────────────────────────────────────────
    const { data: offer, error: offerError } = await supabaseAdmin
      .from("job_offers")
      .select(
        "offer_id, payment_amount, pay_through_platform, is_recurring, offer_status, customer_id, provider_id, payment_id, currency",
      )
      .eq("offer_id", v.data.offer_id)
      .eq("customer_id", user.id)
      .single();

    if (offerError || !offer) return json({ error: "Offer not found" }, 404);

    // Idempotency: an already-paid offer just succeeds.
    if (offer.payment_id) {
      const { data: existing } = await supabaseAdmin
        .from("payments")
        .select("payment_id, payment_status, stripe_checkout_session_id, mollie_checkout_url")
        .eq("payment_id", offer.payment_id)
        .single();
      if (existing?.payment_status === "paid") {
        return json({ success: true, instant: true, payment_id: existing.payment_id, already_paid: true });
      }
    }

    if (offer.offer_status !== "awaiting_confirmation") {
      return json({ error: "Offer not ready for payment" }, 400);
    }

    const isRecurring = offer.is_recurring === true;
    const online = offer.pay_through_platform !== false;
    const service = parseFloat(offer.payment_amount);
    const bd = computeJobBreakdown({
      serviceAmount: service,
      isRecurring,
      payThroughPlatform: online,
    });
    const kind = isRecurring ? "recurring_job" : "one_time";

    // ── Customer (platform) + saved card ─────────────────────────────────
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
      await supabaseAdmin.from("profiles").update({ stripe_customer_id: customerId }).eq("user_id", user.id);
    }
    const defaultPm = await getDefaultPaymentMethod(customerId);
    
    logger.info("Payment creation flow", {
      customerId,
      hasDefaultPm: !!defaultPm,
      defaultPm,
      wantsNewCard,
      mandateId: mandate_id,
      isRecurring,
      willUseCheckout: !defaultPm || wantsNewCard,
      willUseSavedCard: !!defaultPm && !wantsNewCard,
    });

    const period = currentPeriod();
    const breakdownOut = {
      service_amount: bd.service_amount,
      customer_fee: bd.customer_fee,
      provider_fee: bd.provider_fee,
      stripe_fee: bd.stripe_fee,
      total_amount: bd.customer_charge,
      provider_payout: bd.provider_payout,
      platform_revenue: bd.platform_net,
      application_fee: bd.application_fee,
      cash_amount: bd.cash_amount,
      customer_token: isRecurring ? MONTHLY_TOKEN_CUSTOMER : 0,
    };

    // ══════════════════════════════════════════════════════════════════════
    // CASH RECURRING — no online job charge; only check the €15 customer token.
    // DO NOT charge automatically - return status so frontend shows payment modal.
    // ══════════════════════════════════════════════════════════════════════
    if (isRecurring && !online) {
      // Check if token already paid this month (no automatic charging)
      const { data: tokenCheck } = await supabaseAdmin.rpc("record_token_payment", {
        p_user_id: user.id,
        p_offer_id: offer.offer_id,
        p_period: period,
        p_amount: MONTHLY_TOKEN_CUSTOMER,
        p_kind: "customer_token",
      });
      
      const tokenStatus = tokenCheck?.already_paid 
        ? { status: "already_paid", paymentId: tokenCheck.payment_id }
        : { status: "pending_checkout", paymentId: tokenCheck?.payment_id };
      
      logger.info("Cash recurring - token status check", {
        userId: user.id,
        offerId: offer.offer_id,
        tokenStatus,
      });
      
      // Return token status - frontend will show payment modal if needed
      return json({
        success: true,
        instant: false,
        cash_amount: service,
        breakdown: breakdownOut,
        pay_through_platform: false,
        customer_token: tokenStatus,
        message: tokenStatus.status === "already_paid"
          ? `Pay €${service.toFixed(2)} in cash to the provider.`
          : `Payment required: €${MONTHLY_TOKEN_CUSTOMER} monthly token + €${service.toFixed(2)} cash to provider.`,
      });
    }

    // ══════════════════════════════════════════════════════════════════════
    // ONLINE JOB (one-time or recurring) — destination charge to provider.
    // ══════════════════════════════════════════════════════════════════════
    const { data: bank } = await supabaseAdmin
      .from("provider_bank_details")
      .select("stripe_account_id, stripe_charges_enabled")
      .eq("provider_id", offer.provider_id)
      .maybeSingle();

    if (!bank?.stripe_account_id) {
      return json({ error: "Provider has not connected a Stripe account yet" }, 400);
    }

    // The destination account can only receive a transfer once its onboarding
    // is complete (transfers capability active). Re-check live so a provider who
    // just finished onboarding isn't blocked by a stale DB flag.
    if (!bank.stripe_charges_enabled) {
      const live = await getAccountStatus(bank.stripe_account_id);
      if (live.charges_enabled) {
        await supabaseAdmin
          .from("provider_bank_details")
          .update({
            stripe_charges_enabled: true,
            stripe_payouts_enabled: live.payouts_enabled,
            stripe_details_submitted: live.details_submitted,
            stripe_onboarding_status: "active",
            bank_verified: live.payouts_enabled,
            mollie_connect_status: "active",
          })
          .eq("provider_id", offer.provider_id);
      } else {
        return json(
          {
            error:
              "The provider hasn't finished their Stripe onboarding yet, so they can't receive payments. Ask them to complete it in Payment Account settings.",
          },
          400,
        );
      }
    }

    // Create the DB payment record (amounts computed here in TS).
    const { data: created, error: dbErr } = await supabaseAdmin.rpc("create_stripe_job_payment", {
      p_offer_id: offer.offer_id,
      p_customer_id: user.id,
      p_service_amount: bd.service_amount,
      p_customer_charge: bd.customer_charge,
      p_provider_payout: bd.provider_payout,
      p_platform_net: bd.platform_net,
      p_application_fee: bd.application_fee,
      p_customer_fee: bd.customer_fee,
      p_provider_fee: bd.provider_fee,
      p_stripe_fee: bd.stripe_fee,
      p_payment_kind: kind,
    });
    if (dbErr) {
      logger.error("create_stripe_job_payment failed", { error: dbErr.message });
      return json({ error: "Failed to create payment record", details: dbErr.message }, 500);
    }
    const paymentId: string = created.payment_id;
    
    logger.info("Payment record created/retrieved", { 
      paymentId, 
      isExisting: created.existing,
      offerId: offer.offer_id 
    });

    // Idempotency: if this offer's payment already exists, DON'T charge again.
    // Return its current state (paid / in-progress / resumable checkout) so a
    // double-tap or a retry before the webhook lands can't create a 2nd charge.
    if (created.existing) {
      logger.info("Payment already exists, checking status", { paymentId });
      
      const { data: p } = await supabaseAdmin
        .from("payments")
        .select("payment_status, stripe_payment_intent_id, stripe_checkout_session_id, mollie_checkout_url")
        .eq("payment_id", paymentId)
        .single();
        
      logger.info("Existing payment state", { 
        paymentId,
        status: p?.payment_status,
        hasIntent: !!p?.stripe_payment_intent_id,
        hasCheckout: !!p?.stripe_checkout_session_id,
        checkoutUrl: p?.mollie_checkout_url 
      });
      
      if (p?.payment_status === "paid") {
        logger.info("Payment already paid, returning success", { paymentId });
        return json({ success: true, instant: true, payment_id: paymentId, already_paid: true });
      }
      if (p?.stripe_payment_intent_id) {
        // A charge was already started for this payment — never charge twice.
        logger.info("Payment intent already exists, returning processing status", { paymentId });
        return json({ success: true, payment_id: paymentId, status: "processing", message: "Payment already in progress" });
      }
      if (p?.mollie_checkout_url && p?.stripe_checkout_session_id) {
        // A checkout was already created — but for recurring jobs, check if it needs token
        if (isRecurring) {
          const { data: tokenCheck } = await supabaseAdmin.rpc("record_token_payment", {
            p_user_id: user.id,
            p_offer_id: offer.offer_id,
            p_period: period,
            p_amount: MONTHLY_TOKEN_CUSTOMER,
            p_kind: "customer_token",
          });
          
          const needsToken = !tokenCheck?.already_paid;
          
          if (needsToken) {
            // Token needed but old checkout doesn't have it - create new checkout with token
            logger.info("Old checkout exists but needs token, creating new checkout", { 
              paymentId,
              oldSession: p.stripe_checkout_session_id 
            });
            // Clear old checkout so new one is created below
            await supabaseAdmin
              .from("payments")
              .update({ 
                stripe_checkout_session_id: null, 
                mollie_checkout_url: null 
              })
              .eq("payment_id", paymentId);
            // Fall through to create new checkout with token
          } else {
            // Token already paid, existing checkout is fine
            logger.info("Checkout exists, token not needed, using existing URL", { paymentId });
            return json({
              success: true,
              payment_id: paymentId,
              checkout_url: p.mollie_checkout_url,
              amount: bd.customer_charge,
              breakdown: breakdownOut,
              pay_through_platform: true,
            });
          }
        } else {
          // Non-recurring, existing checkout is fine
          logger.info("Checkout exists (non-recurring), using existing URL", { paymentId });
          return json({
            success: true,
            payment_id: paymentId,
            checkout_url: p.mollie_checkout_url,
            amount: bd.customer_charge,
            breakdown: breakdownOut,
            pay_through_platform: true,
          });
        }
      }
      logger.info("Payment exists but no charge/checkout started, continuing", { paymentId });
      // else: row exists but no charge/checkout started yet → fall through.
    }

    const metadata = {
      offer_id: offer.offer_id,
      customer_id: user.id,
      provider_id: offer.provider_id,
      payment_id: paymentId,
      payment_kind: kind,
    };

    // ── Saved card → charge off-session now (ONLY if user didn't explicitly request new card) ──
    if (defaultPm && !wantsNewCard) {
      logger.info("Attempting off-session charge with saved card", { defaultPm, paymentId });
      
      try {
        // Check if token needed for recurring job
        let tokenAmount = 0;
        let tokenPaymentId: string | null = null;
        
        if (isRecurring) {
          const { data: tokenCheck } = await supabaseAdmin.rpc("record_token_payment", {
            p_user_id: user.id,
            p_offer_id: offer.offer_id,
            p_period: period,
            p_amount: MONTHLY_TOKEN_CUSTOMER,
            p_kind: "customer_token",
          });
          
          if (!tokenCheck?.already_paid && tokenCheck?.payment_id) {
            tokenAmount = MONTHLY_TOKEN_CUSTOMER;
            tokenPaymentId = tokenCheck.payment_id;
            logger.info("Token will be included in charge", { tokenAmount, tokenPaymentId });
          }
        }
        
        // Calculate total charge (job + token if needed)
        const totalCharge = bd.customer_charge + tokenAmount;
        
        // Calculate new application fee that includes platform share of token
        // Job application fee stays same, but we add token to the total charge
        // Provider still gets same payout, extra goes to platform
        const totalApplicationFee = bd.application_fee + tokenAmount;
        
        logger.info("Charging with token included", {
          jobAmount: bd.customer_charge,
          tokenAmount,
          totalCharge,
          providerPayout: bd.provider_payout,
          totalApplicationFee,
        });
        
        const pi = await chargeSavedCardDestination({
          amountEuros: totalCharge,
          applicationFeeEuros: totalApplicationFee,
          destinationAccountId: bank.stripe_account_id,
          customerId,
          paymentMethodId: defaultPm,
          description: isRecurring && tokenAmount > 0 
            ? "HelpersHob job payment + monthly token"
            : "HelpersHob job payment",
          metadata,
          idempotencyKey: `job_${paymentId}`,
        });

        await supabaseAdmin.rpc("update_stripe_payment_status", {
          p_payment_id: paymentId,
          p_stripe_status: pi.status,
          p_payment_intent_id: pi.id,
          p_charge_id: (pi.latest_charge as string) ?? null,
        });
        
        // Mark token as paid if it was included
        if (tokenPaymentId) {
          await supabaseAdmin.rpc("update_stripe_payment_status", {
            p_payment_id: tokenPaymentId,
            p_stripe_status: pi.status,
            p_payment_intent_id: pi.id,
            p_charge_id: (pi.latest_charge as string) ?? null,
          });
          logger.info("Token marked as paid", { tokenPaymentId });
        }

        return json({
          success: true,
          instant: pi.status === "succeeded",
          payment_id: paymentId,
          stripe_payment_intent_id: pi.id,
          status: pi.status,
          saved_card_used: true,
          amount: totalCharge,
          breakdown: {
            ...breakdownOut,
            customer_token: tokenAmount,
          },
          pay_through_platform: true,
        });
      } catch (err: any) {
        // Card needs authentication (SCA) or was declined off-session → fall
        // through to hosted Checkout so the customer can authenticate.
        logger.warn("Off-session charge failed, falling back to Checkout", {
          paymentId,
          error: err.message,
          code: err.code,
        });
      }
    }

    // ── No saved card (or off-session needs auth) → hosted Checkout ───────
    // Check if token needed for recurring job
    let tokenAmount = 0;
    let tokenPaymentId: string | null = null;
    
    if (isRecurring) {
      const { data: tokenCheck } = await supabaseAdmin.rpc("record_token_payment", {
        p_user_id: user.id,
        p_offer_id: offer.offer_id,
        p_period: period,
        p_amount: MONTHLY_TOKEN_CUSTOMER,
        p_kind: "customer_token",
      });
      
      if (!tokenCheck?.already_paid && tokenCheck?.payment_id) {
        tokenAmount = MONTHLY_TOKEN_CUSTOMER;
        tokenPaymentId = tokenCheck.payment_id;
        logger.info("Token will be included in checkout", { tokenAmount, tokenPaymentId });
      }
    }
    
    const totalCharge = bd.customer_charge + tokenAmount;
    const totalApplicationFee = bd.application_fee + tokenAmount;
    
    logger.info("Creating checkout session with token included", { 
      isRecurring,
      jobAmount: bd.customer_charge,
      tokenAmount,
      totalCharge,
      paymentId,
    });

    const session = await createJobCheckoutSession({
      amountEuros: totalCharge,
      applicationFeeEuros: totalApplicationFee,
      destinationAccountId: bank.stripe_account_id,
      customerId,
      description: isRecurring && tokenAmount > 0 
        ? "HelpersHob job payment + monthly token"
        : "HelpersHob job payment",
      metadata: {
        ...metadata,
        ...(tokenPaymentId && { token_payment_id: tokenPaymentId }),
        ...(tokenAmount && { token_amount: tokenAmount.toString() }),
      },
      successUrl: `${APP_URL}/payment/success?payment_id=${paymentId}&offer_id=${offer.offer_id}`,
      cancelUrl: `${APP_URL}/payment/cancel?payment_id=${paymentId}&offer_id=${offer.offer_id}`,
    });

    await supabaseAdmin
      .from("payments")
      .update({ stripe_checkout_session_id: session.id, mollie_checkout_url: session.url })
      .eq("payment_id", paymentId);

    return json({
      success: true,
      payment_id: paymentId,
      checkout_url: session.url,
      amount: bd.customer_charge,
      breakdown: breakdownOut,
      pay_through_platform: true,
    });
  } catch (error: any) {
    logger.error("Payment creation failed", { userId: user.id, error: error.message });
    return json({ error: "Failed to create payment", details: error.message }, 500);
  }
});

// ── Customer monthly token (€15) — off-session, or Checkout if no card ────────
interface TokenResult {
  status: "already_paid" | "charged" | "pending_checkout";
  instant: boolean;
  checkoutUrl?: string | null;
  paymentId?: string;
}

async function chargeCustomerToken(params: {
  userId: string;
  offerId: string;
  period: string;
  customerId: string;
  defaultPm: string | null;
}): Promise<TokenResult> {
  const { data: rec } = await supabaseAdmin.rpc("record_token_payment", {
    p_user_id: params.userId,
    p_offer_id: params.offerId,
    p_period: params.period,
    p_amount: MONTHLY_TOKEN_CUSTOMER,
    p_kind: "customer_token",
  });
  if (rec?.already_paid) {
    return { status: "already_paid", instant: true, paymentId: rec.payment_id };
  }
  const tokenPaymentId: string = rec.payment_id;
  const metadata = {
    user_id: params.userId,
    offer_id: params.offerId,
    payment_id: tokenPaymentId,
    payment_kind: "customer_token",
    period: params.period,
  };

  if (params.defaultPm) {
    try {
      const pi = await chargePlatformOffSession({
        amountEuros: MONTHLY_TOKEN_CUSTOMER,
        customerId: params.customerId,
        paymentMethodId: params.defaultPm,
        description: `HelpersHob monthly token (${params.period})`,
        metadata,
        idempotencyKey: `ctok_${tokenPaymentId}`,
      });
      await supabaseAdmin.rpc("update_stripe_payment_status", {
        p_payment_id: tokenPaymentId,
        p_stripe_status: pi.status,
        p_payment_intent_id: pi.id,
        p_charge_id: (pi.latest_charge as string) ?? null,
      });
      return { status: "charged", instant: pi.status === "succeeded", paymentId: tokenPaymentId };
    } catch (err: any) {
      logger.warn("Customer token off-session failed, using Checkout", { error: err.message });
    }
  }

  const session = await createTokenCheckoutSession({
    amountEuros: MONTHLY_TOKEN_CUSTOMER,
    customerId: params.customerId,
    description: `HelpersHob monthly token (${params.period})`,
    metadata,
    successUrl: `${APP_URL}/payment/success?payment_id=${tokenPaymentId}&type=token`,
    cancelUrl: `${APP_URL}/payment/cancel?payment_id=${tokenPaymentId}&type=token`,
  });
  await supabaseAdmin
    .from("payments")
    .update({ stripe_checkout_session_id: session.id, mollie_checkout_url: session.url })
    .eq("payment_id", tokenPaymentId);
  return { status: "pending_checkout", instant: false, checkoutUrl: session.url, paymentId: tokenPaymentId };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
