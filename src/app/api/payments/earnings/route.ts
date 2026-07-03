// GET: Provider earnings summary with payment list
import { NextRequest } from 'next/server';
import { requireRole } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export const GET = requireRole('service_provider')(async (request: NextRequest, user) => {
  try {
    console.log('🔵 Fetching earnings for provider:', user.id);

    // Get ONLY PAID payments for this provider (not pending - those are abandoned checkouts)
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
          pay_through_platform,
          is_recurring,
          parent_offer_id,
          customer_id,
          customer:profiles!job_offers_customer_id_fkey (
            name,
            email
          )
        )
      `)
      .eq('payee_id', user.id)
      .eq('payment_status', 'paid') // ONLY paid - pending means customer didn't complete payment
      .order('paid_at', { ascending: false });

    if (error) {
      console.error('❌ Error fetching earnings:', error);
      return new Response(JSON.stringify({ 
        success: false,
        error: 'Failed to fetch earnings',
        details: error.message,
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log('🔵 Found payments:', payments?.length || 0);

    // All payments are paid (we filtered above), so calculate totals
    const totalEarned = payments?.reduce((sum, p) => {
      const providerPayout = parseFloat(p.provider_payout || '0');
      return sum + providerPayout;
    }, 0) || 0;

    const totalJobs = payments?.length || 0;

    // Pending amount is 0 - we don't show pending payments anymore
    const pendingAmount = 0;

    // Format payment list for response
    const paymentList = payments?.map(p => {
      // Get job offer info - handle Supabase's array/object inconsistency
      const jobOffer = Array.isArray(p.job_offers) ? p.job_offers[0] : p.job_offers;
      const customer = jobOffer && (Array.isArray(jobOffer.customer) ? jobOffer.customer[0] : jobOffer.customer);
      
      // Determine payment type
      const isCashPayment = jobOffer?.pay_through_platform === false;
      const cashAmount = parseFloat(p.cash_amount || '0');
      
      // Determine if payment was routed (split) based on pay_through_platform flag
      // Cash payments (pay_through_platform = false) are NOT routed - marked as "Paid" immediately
      const wasRouted = jobOffer?.pay_through_platform === true;
      
      return {
        payment_id: p.payment_id,
        offer_id: p.offer_id,
        job_title: jobOffer?.offer_title || 'Unknown Job',
        customer_name: customer?.name || 'Unknown Customer',
        customer_email: customer?.email || '',
        service_date: jobOffer?.service_date || p.created_at,
        paid_at: p.paid_at || p.created_at,
        provider_payout: parseFloat(p.provider_payout || '0'),
        platform_fee: parseFloat(p.platform_fee || '0'),
        service_amount: parseFloat(p.service_amount || '0'),
        total_amount: parseFloat(p.total_amount || '0'),
        cash_amount: cashAmount, // NEW
        payment_status: p.payment_status,
        payment_type: p.payment_type,
        payment_method: isCashPayment 
          ? 'Platform Fee + Cash' 
          : (p.payment_type === 'job_completion' ? 'Online Payment' : p.payment_type),
        mollie_payment_id: p.mollie_payment_id,
        currency: p.currency,
        was_routed: wasRouted, // Shows if payment was split via Mollie Connect
        // Cash payments are considered paid out immediately (provider collects cash)
        // Mollie Connect payments go directly to provider
        // Non-split platform payments need manual payout
        is_paid_out: isCashPayment || (wasRouted && p.payment_status === 'paid'),
        paid_out_at: (isCashPayment || wasRouted) && p.paid_at ? p.paid_at : null,
        is_recurring: jobOffer?.is_recurring || false, // NEW
        parent_offer_id: jobOffer?.parent_offer_id || null, // NEW
      };
    }) || [];

    console.log('✅ Earnings calculated:', {
      totalEarned,
      totalJobs,
      pendingAmount,
      payments: paymentList.length,
    });

    return new Response(JSON.stringify({
      success: true,
      data: {
        total_earned: totalEarned,
        total_jobs: totalJobs,
        pending_amount: pendingAmount,
        currency: 'EUR',
        payments: paymentList,
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('❌ Earnings fetch error:', error);
    
    return new Response(JSON.stringify({ 
      success: false,
      error: 'Failed to fetch earnings',
      details: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});
