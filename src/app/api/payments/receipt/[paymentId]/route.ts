// GET: Get payment receipt
import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

export const GET = requireAuth(
  async (request: NextRequest, user, context: any) => {
    try {
      // Await params (Next.js 15 requirement)
      const { paymentId } = await context.params;

      if (!paymentId) {
        return new Response(JSON.stringify({ error: "Payment ID required" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Get payment with all related details
      const { data: payment, error } = await supabaseAdmin
        .from("payments")
        .select(
          `
        payment_id,
        offer_id,
        payer_id,
        payee_id,
        service_amount,
        platform_fee,
        provider_payout,
        total_amount,
        cash_amount,
        currency,
        payment_status,
        payment_type,
        mollie_payment_id,
        paid_at,
        created_at,
        job_offers!payments_offer_id_fkey (
          offer_title,
          service_date,
          pay_through_platform,
          customer_id,
          provider_id,
          customer:profiles!job_offers_customer_id_fkey (
            name,
            email
          ),
          provider:profiles!job_offers_provider_id_fkey (
            name,
            email
          )
        )
      `,
        )
        .eq("payment_id", paymentId)
        .single();

      if (error || !payment) {
        console.error("Payment not found:", error);
        return new Response(JSON.stringify({ error: "Payment not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }

      const jobOffer = payment.job_offers as any;

      const customerId = jobOffer.customer_id;
      const providerId = jobOffer.provider_id;

      if (customerId !== user.id && providerId !== user.id) {
        return new Response(JSON.stringify({ error: "Access denied" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Format receipt data
      const isCashPayment = jobOffer.pay_through_platform === false;
      const cashAmount = parseFloat(payment.cash_amount || "0");

      const receiptData = {
        receipt_id: payment.payment_id,
        payment_date: payment.paid_at || payment.created_at,
        job_title: jobOffer.offer_title,
        service_date: jobOffer.service_date,
        customer: {
          name: jobOffer.customer.name,
          email: jobOffer.customer.email,
        },
        provider: {
          name: jobOffer.provider.name,
          email: jobOffer.provider.email,
        },
        amounts: {
          service_fee: parseFloat(payment.service_amount),
          platform_fee: parseFloat(payment.platform_fee),
          total_paid: parseFloat(payment.total_amount),
          provider_receives: parseFloat(payment.provider_payout || "0"),
          cash_amount: cashAmount, // NEW
          currency: payment.currency,
        },
        is_cash_payment: isCashPayment, // NEW
        payment_method:
          payment.payment_type === "job_completion"
            ? isCashPayment
              ? "Platform Fee + Cash"
              : "Online Payment"
            : payment.payment_type,
        payment_id: payment.mollie_payment_id || payment.payment_id,
        status: payment.payment_status,
      };

      return new Response(
        JSON.stringify({
          success: true,
          data: receiptData,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    } catch (error: any) {
      console.error("Receipt fetch error:", error);

      return new Response(
        JSON.stringify({
          error: "Failed to fetch receipt",
          details: error.message,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  },
);
