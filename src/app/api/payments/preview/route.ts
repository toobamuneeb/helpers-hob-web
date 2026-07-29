/**
 * Preview payment breakdown before creating actual payment
 * GET /api/payments/preview?amount=50&isRecurring=true&payThroughPlatform=true
 */

import { NextRequest, NextResponse } from "next/server";
import { computeJobBreakdown, MONTHLY_TOKEN_CUSTOMER, currentPeriod } from "@/lib/stripe";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import logger from "@/lib/logger";

export const GET = requireAuth(async (request: NextRequest, user) => {
  try {
    const { searchParams } = new URL(request.url);
    const amount = parseFloat(searchParams.get("amount") || "0");
    const isRecurring = searchParams.get("isRecurring") === "true";
    const payThroughPlatform = searchParams.get("payThroughPlatform") !== "false";

    if (!amount || amount <= 0) {
      return NextResponse.json(
        { success: false, error: "Invalid amount" },
        { status: 400 }
      );
    }

    // Calculate breakdown using same logic as payment creation
    const bd = computeJobBreakdown({
      serviceAmount: amount,
      isRecurring,
      payThroughPlatform,
    });

    // Check if monthly token already paid this month for recurring jobs
    let monthlyToken = 0;
    if (isRecurring) {
      const period = currentPeriod();
      
      // Check if token already paid this month
      const { data: existingToken } = await supabaseAdmin
        .from("payments")
        .select("payment_id, payment_status")
        .eq("customer_id", user.id)
        .eq("payment_kind", "customer_token")
        .eq("period", period)
        .eq("payment_status", "paid")
        .maybeSingle();
      
      if (existingToken) {
        // Token already paid this month - don't show in preview
        monthlyToken = 0;
        logger.info("Token already paid this month, excluding from preview", { 
          period, 
          userId: user.id,
          tokenPaymentId: existingToken.payment_id 
        });
      } else {
        // Token not paid yet - include in preview
        monthlyToken = MONTHLY_TOKEN_CUSTOMER;
        logger.info("Token not paid this month, including in preview", { 
          period, 
          userId: user.id 
        });
      }
    }
    
    const response = {
      success: true,
      service_amount: bd.service_amount,
      platform_fee: bd.customer_fee, // 1% or 10%
      stripe_fee: bd.fee_half, // Customer's share of Stripe processing fee
      monthly_token: monthlyToken,
      subtotal: bd.customer_charge, // Amount without token
      total: bd.customer_charge + monthlyToken,
      is_recurring: isRecurring,
      pay_through_platform: payThroughPlatform,
      breakdown: {
        service: bd.service_amount,
        platform_fee: bd.customer_fee,
        stripe_fee: bd.fee_half,
        monthly_token: monthlyToken,
        total: bd.customer_charge + monthlyToken,
      },
    };

    logger.info("Payment preview calculated", {
      amount,
      isRecurring,
      payThroughPlatform,
      service_amount: response.service_amount,
      platform_fee: response.platform_fee,
      stripe_fee: response.stripe_fee,
      monthly_token: response.monthly_token,
      subtotal: response.subtotal,
      total: response.total,
    });

    return NextResponse.json(response);
  } catch (error: any) {
    logger.error("Payment preview error", { error: error.message });
    return NextResponse.json(
      { success: false, error: error.message || "Failed to calculate preview" },
      { status: 500 }
    );
  }
});
