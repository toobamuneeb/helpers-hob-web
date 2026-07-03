// GET: Customer payment history — the payments this user made (as payer),
// with job + provider details, for the "Payment History" screen.
import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export const GET = requireAuth(async (request: NextRequest, user) => {
  try {
    console.log('🔵 Fetching payment history for user:', user.id);

    const { data: payments, error } = await supabaseAdmin
      .from('payments')
      .select(`
        payment_id,
        offer_id,
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
          service_time,
          pay_through_platform,
          is_recurring,
          provider_id,
          provider:profiles!job_offers_provider_id_fkey (
            name,
            email
          )
        )
      `)
      .eq('payer_id', user.id)
      .eq('payment_status', 'paid') // only completed transactions
      .order('paid_at', { ascending: false });

    if (error) {
      console.error('❌ Error fetching payment history:', error);
      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to fetch payment history',
        details: error.message,
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const paymentList = (payments || []).map((p) => {
      // Supabase returns the joined row as object OR array — normalise both.
      const jobOffer: any = Array.isArray(p.job_offers) ? p.job_offers[0] : p.job_offers;
      const provider: any =
        jobOffer && (Array.isArray(jobOffer.provider) ? jobOffer.provider[0] : jobOffer.provider);

      const isCashPayment = jobOffer?.pay_through_platform === false;

      return {
        payment_id: p.payment_id,
        offer_id: p.offer_id,
        job_title: jobOffer?.offer_title || 'Unknown Job',
        provider_name: provider?.name || 'Unknown Provider',
        service_date: jobOffer?.service_date || p.created_at,
        service_time: jobOffer?.service_time || '',
        paid_at: p.paid_at || p.created_at,
        service_amount: parseFloat(p.service_amount || '0'),
        platform_fee: parseFloat(p.platform_fee || '0'),
        provider_payout: parseFloat(p.provider_payout || '0'),
        total_amount: parseFloat(p.total_amount || '0'),
        cash_amount: parseFloat(p.cash_amount || '0'),
        payment_status: p.payment_status,
        pay_through_platform: jobOffer?.pay_through_platform !== false,
        is_cash_payment: isCashPayment,
        currency: p.currency || 'EUR',
        is_recurring: jobOffer?.is_recurring || false,
      };
    });

    const totalPaid = paymentList.reduce((sum, p) => sum + p.total_amount, 0);

    console.log('✅ Payment history:', { count: paymentList.length, totalPaid });

    return new Response(JSON.stringify({
      success: true,
      data: {
        total_paid: totalPaid,
        total_payments: paymentList.length,
        currency: 'EUR',
        payments: paymentList,
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('❌ Payment history fetch error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Failed to fetch payment history',
      details: error.message,
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
