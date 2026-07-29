/**
 * GET /api/payments/methods
 * List the user's saved cards (Stripe payment methods on the platform customer).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { listSavedCards } from "@/lib/stripe";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

export async function GET(request: NextRequest) {
  try {
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
      return NextResponse.json(
        { success: false, error: "Invalid token" },
        { status: 401 },
      );
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .single();

    if (!profile?.stripe_customer_id) {
      return NextResponse.json({ success: true, data: { methods: [] } });
    }

    const cards = await listSavedCards(profile.stripe_customer_id);

    // Keep the response shape the app already understands (id + card fields).
    const methods = cards.map((c) => ({
      id: c.id,
      method: "creditcard",
      cardLabel: c.brand,
      cardNumber: c.last4,
      cardHolder: undefined,
      exp_month: c.exp_month,
      exp_year: c.exp_year,
      is_default: c.is_default,
      createdAt: null,
    }));

    return NextResponse.json({
      success: true,
      data: { methods, customer_id: profile.stripe_customer_id },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch payment methods" },
      { status: 500 },
    );
  }
}
