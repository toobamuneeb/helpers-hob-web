/**
 * DELETE /api/payments/methods/[mandateId]
 * Detach a saved card. `mandateId` is the Stripe payment method id (pm_…).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { detachCard } from "@/lib/stripe";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ mandateId: string }> },
) {
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

    const { mandateId } = await params; // = Stripe payment method id
    if (!mandateId) {
      return NextResponse.json(
        { success: false, error: "Payment method ID is required" },
        { status: 400 },
      );
    }

    await detachCard(mandateId);
    return NextResponse.json({
      success: true,
      message: "Payment method removed successfully",
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to delete payment method" },
      { status: 500 },
    );
  }
}
