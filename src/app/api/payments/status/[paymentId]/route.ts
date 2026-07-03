// GET: Check payment status (public endpoint - no auth needed)
// Used by payment processing page to poll status

import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const GET = async (
  request: NextRequest,
  { params }: { params: Promise<{ paymentId: string }> }
) => {
  try {
    // Next.js 15: params is now a Promise, must await it
    const { paymentId } = await params;

    if (!paymentId) {
      return new Response(JSON.stringify({ error: 'Payment ID required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get payment status from database
    const { data: payment, error } = await supabaseAdmin
      .from('payments')
      .select('payment_id, payment_status, mollie_payment_id, paid_at, offer_id')
      .eq('payment_id', paymentId)
      .single();

    if (error || !payment) {
      return new Response(JSON.stringify({ 
        error: 'Payment not found' 
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      success: true,
      payment_id: payment.payment_id,
      status: payment.payment_status,
      mollie_payment_id: payment.mollie_payment_id,
      paid_at: payment.paid_at,
      offer_id: payment.offer_id,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Payment status check error:', error);
    
    return new Response(JSON.stringify({ 
      error: 'Failed to check payment status',
      details: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
