/**
 * GET /api/payments/methods
 * Get customer's saved payment methods (Mollie mandates)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCustomerPaymentMethods } from "../../../../lib/mollie";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);

export async function GET(request: NextRequest) {
  try {
    // Get user from JWT token
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { success: false, error: "No authorization token" },
        { status: 401 },
      );
    }

    const token = authHeader.substring(7);
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      console.error("❌ Auth error:", authError);
      return NextResponse.json(
        { success: false, error: "Invalid token" },
        { status: 401 },
      );
    }

    console.log("🔵 payment-methods - User ID:", user.id);

    // Get customer's Mollie customer ID from profiles table
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("mollie_customer_id")
      .eq("user_id", user.id)
      .single();

    if (profileError || !profile?.mollie_customer_id) {
      console.log("⚠️ No Mollie customer ID found for user");
      return NextResponse.json({
        success: true,
        data: { methods: [] },
      });
    }

    console.log("🔵 Mollie customer ID:", profile.mollie_customer_id);

    // Fetch mandates from Mollie using helper function
    const validMandates = await getCustomerPaymentMethods(
      profile.mollie_customer_id,
    );

    console.log("✅ Returning valid mandates:", validMandates.length);

    return NextResponse.json({
      success: true,
      data: {
        methods: validMandates,
        customer_id: profile.mollie_customer_id,
      },
    });
  } catch (error: any) {
    console.error("❌ Get payment methods error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to fetch payment methods",
      },
      { status: 500 },
    );
  }
}
