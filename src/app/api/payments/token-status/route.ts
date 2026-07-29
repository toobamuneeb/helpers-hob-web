/**
 * Check if customer's monthly token has been paid for current month
 * GET /api/payments/token-status
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { currentPeriod } from "@/lib/stripe";
import { requireAuth } from "@/lib/auth";
import logger from "@/lib/logger";

export const GET = requireAuth(async (request: NextRequest, user) => {
  try {
    const period = currentPeriod(); // YYYY-MM format

    // Check if customer token was paid this month
    const { data: tokenPayment } = await supabaseAdmin
      .from("payments")
      .select("payment_id, total_amount, created_at, stripe_payment_status")
      .eq("payer_id", user.id)
      .eq("payment_kind", "customer_token")
      .gte("created_at", `${period}-01`)
      .lt("created_at", `${period}-32`)
      .in("stripe_payment_status", ["succeeded", "processing"])
      .maybeSingle();

    const hasPaid = !!tokenPayment;
    const amount = tokenPayment ? parseFloat(tokenPayment.total_amount || "0") : 0;

    logger.info("Token status check", {
      userId: user.id,
      period,
      hasPaid,
      amount,
    });

    return NextResponse.json({
      success: true,
      has_paid: hasPaid,
      amount,
      period,
      payment_id: tokenPayment?.payment_id,
    });
  } catch (error: any) {
    logger.error("Token status check error", { error: error.message });
    return NextResponse.json(
      { success: false, error: error.message || "Failed to check token status" },
      { status: 500 }
    );
  }
});
