/**
 * GET /api/providers/mollie-balance
 * Get provider's Mollie payments and settlements using their stored access token
 */

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { createMollieClient } from "@mollie/api-client";
import { getValidProviderToken } from "@/lib/mollie";

/**
 * Get earnings from database (fallback when Mollie API unavailable)
 */
async function getDatabaseEarnings(
  providerId: string,
  mollieConnectId?: string,
): Promise<NextResponse> {
  console.log("⚠️ Falling back to database earnings");

  const { data: payments, error: dbError } = await supabaseAdmin
    .from("payments")
    .select("provider_payout, payment_status, paid_at, created_at")
    .eq("payee_id", providerId)
    .eq("payment_status", "paid")
    .order("paid_at", { ascending: false })
    .limit(50);

  if (dbError) {
    console.error("❌ Database error:", dbError);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch earnings from database",
        details: dbError.message,
      },
      { status: 500 },
    );
  }

  const totalEarned =
    payments?.reduce((sum, p) => {
      return sum + parseFloat(p.provider_payout || "0");
    }, 0) || 0;

  return NextResponse.json({
    success: true,
    data: {
      balance: {
        available: {
          amount: totalEarned.toFixed(2),
          currency: "EUR",
        },
        pending: {
          amount: "0.00",
          currency: "EUR",
        },
        total: {
          amount: totalEarned,
          currency: "EUR",
        },
      },
      settlements: [],
      mollie_connect_id: mollieConnectId,
      source: "database",
      note: "Showing earnings from your completed payments. Reconnect to Mollie for live balance.",
      needsReconnect: true,
    },
  });
}

export const GET = requireRole("service_provider")(async (
  request: NextRequest,
  user,
) => {
  try {
    console.log("🔵 Fetching Mollie balance for provider:", user.id);

    // Get provider's bank details with access token
    const { data: bankDetails, error: dbError } = await supabaseAdmin
      .from("provider_bank_details")
      .select(
        "mollie_access_token, mollie_refresh_token, mollie_connect_id, token_expires_at",
      )
      .eq("provider_id", user.id)
      .single();

    if (dbError || !bankDetails) {
      console.log("❌ No bank details found for provider");
      return NextResponse.json(
        {
          success: false,
          error: "No Mollie account connected",
        },
        { status: 404 },
      );
    }

    if (!bankDetails.mollie_access_token) {
      console.log("❌ No access token found");
      return NextResponse.json(
        {
          success: false,
          error: "Mollie account not properly connected",
        },
        { status: 400 },
      );
    }

    console.log(
      "🔍 Access token found (first 20 chars):",
      bankDetails.mollie_access_token.substring(0, 20) + "...",
    );
    console.log(
      "🔍 Token type:",
      bankDetails.mollie_access_token.startsWith("access_")
        ? "OAuth token"
        : "Unknown",
    );
    console.log(
      "🔍 Token expires:",
      bankDetails.token_expires_at || "Not tracked",
    );

    // Get valid access token (auto-refreshed when expired)
    let accessToken: string | null;
    try {
      accessToken = await getValidProviderToken(user.id);
    } catch (refreshError: any) {
      console.error("❌ Token refresh failed:", refreshError);
      accessToken = null;
    }

    if (!accessToken) {
      // Fall back to database earnings
      return await getDatabaseEarnings(user.id, bankDetails.mollie_connect_id);
    }

    // Create Mollie client with valid access token
    const mollieClient = createMollieClient({
      accessToken,
    });

    console.log(
      "🔍 Mollie client created. Available methods:",
      Object.keys(mollieClient),
    );

    try {
      // ROUTING MODEL: the payment object lives on the PLATFORM account, so the
      // provider's own payments list is empty. Compute earnings from OUR DB
      // instead — the provider_payout for payments where they are the payee.
      // This is accurate in both test and live mode.
      const { data: paidRows } = await supabaseAdmin
        .from("payments")
        .select("provider_payout")
        .eq("payee_id", user.id)
        .eq("payment_status", "paid");

      const { data: pendingRows } = await supabaseAdmin
        .from("payments")
        .select("provider_payout")
        .eq("payee_id", user.id)
        .in("payment_status", ["pending", "processing"]);

      let availableAmount = (paidRows || []).reduce(
        (sum, p) => sum + parseFloat(p.provider_payout || "0"),
        0,
      );
      const pendingAmount = (pendingRows || []).reduce(
        (sum, p) => sum + parseFloat(p.provider_payout || "0"),
        0,
      );

      console.log("✅ Earnings from DB:", {
        paid: paidRows?.length || 0,
        pending: pendingRows?.length || 0,
        availableAmount,
        pendingAmount,
      });

      // Fetch recent settlements (payouts to their bank).

      let settlements: any[] = [];
      try {
        const settlementsPage = await mollieClient.settlements.page({
          limit: 10,
        });
        settlements = Array.isArray(settlementsPage)
          ? settlementsPage
          : Array.from(settlementsPage);
        console.log("✅ Settlements fetched:", settlements.length);
      } catch (settlementsError: any) {
        console.warn(
          "⚠️ Could not fetch settlements (likely missing settlements.read scope):",
          settlementsError.message,
        );
      }

      // Subtract settled amounts from available (already paid out)
      settlements.forEach((settlement: any) => {
        if (settlement.status === "paid" && settlement.amount?.value) {
          availableAmount -= parseFloat(settlement.amount.value);
        }
      });

      // Ensure no negative balance
      availableAmount = Math.max(0, availableAmount);

      // Format response
      const balanceData = {
        available: {
          amount: availableAmount.toFixed(2),
          currency: "EUR",
        },
        pending: {
          amount: pendingAmount.toFixed(2),
          currency: "EUR",
        },
        total: {
          amount: availableAmount + pendingAmount,
          currency: "EUR",
        },
      };

      const settlementsData = settlements.map((settlement: any) => ({
        id: settlement.id,
        reference: settlement.reference,
        amount: settlement.amount?.value || "0.00",
        currency: settlement.amount?.currency || "EUR",
        status: settlement.status,
        createdAt: settlement.createdAt,
        settledAt: settlement.settledAt || null,
      }));

      return NextResponse.json({
        success: true,
        data: {
          balance: balanceData,
          settlements: settlementsData,
          mollie_connect_id: bankDetails.mollie_connect_id,
        },
      });
    } catch (mollieError: any) {
      console.error("❌ Mollie API error:", mollieError);

      // If token expired or unauthorized, fall back to our database
      if (mollieError.statusCode === 401) {
        console.log(
          "⚠️ Mollie token invalid/expired - falling back to database earnings",
        );

        // Get earnings from our payments table instead
        const { data: payments, error: dbError } = await supabaseAdmin
          .from("payments")
          .select("provider_payout, payment_status, paid_at, created_at")
          .eq("payee_id", user.id)
          .eq("payment_status", "paid")
          .order("paid_at", { ascending: false })
          .limit(50);

        if (dbError) {
          console.error("❌ Database error:", dbError);
          return NextResponse.json(
            {
              success: false,
              error: "Failed to fetch earnings from database",
              details: dbError.message,
            },
            { status: 500 },
          );
        }

        // Calculate totals from our database
        const totalEarned =
          payments?.reduce((sum, p) => {
            return sum + parseFloat(p.provider_payout || "0");
          }, 0) || 0;

        return NextResponse.json({
          success: true,
          data: {
            balance: {
              available: {
                amount: totalEarned.toFixed(2),
                currency: "EUR",
              },
              pending: {
                amount: "0.00",
                currency: "EUR",
              },
              total: {
                amount: totalEarned,
                currency: "EUR",
              },
            },
            settlements: [],
            mollie_connect_id: bankDetails.mollie_connect_id,
            source: "database", // Indicate this came from our DB, not Mollie
            note: "Mollie connection expired. Reconnect to see live balance and settlements.",
            needsReconnect: true,
          },
        });
      }

      return NextResponse.json(
        {
          success: false,
          error: "Failed to fetch balance from Mollie",
          details: mollieError.message,
          needsReconnect: mollieError.statusCode === 401,
        },
        { status: 500 },
      );
    }
  } catch (error: any) {
    console.error("❌ Balance fetch error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch balance",
        details: error.message,
      },
      { status: 500 },
    );
  }
});
