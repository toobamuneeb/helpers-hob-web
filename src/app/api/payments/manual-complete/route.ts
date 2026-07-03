// Manual Payment Completion - FOR LOCALHOST TESTING ONLY
// Use this when webhook can't reach localhost

import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import logger from '@/lib/logger';

export const POST = requireAuth(async (request: NextRequest, user) => {
  try {
    const { offer_id } = await request.json();

    if (!offer_id) {
      return new Response(JSON.stringify({ error: 'offer_id required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log('🔧 Manual completion for offer:', offer_id);

    // Get payment for this offer
    const { data: offer, error: offerError } = await supabaseAdmin
      .from('job_offers')
      .select('payment_id, offer_status, customer_id')
      .eq('offer_id', offer_id)
      .single();

    if (offerError || !offer) {
      return new Response(JSON.stringify({ error: 'Offer not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!offer.payment_id) {
      return new Response(JSON.stringify({ error: 'No payment for this offer' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Verify user is customer
    if (offer.customer_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Update payment to paid
    const { error: paymentError } = await supabaseAdmin
      .from('payments')
      .update({
        payment_status: 'paid',
        mollie_status: 'paid',
        paid_at: new Date().toISOString()
      })
      .eq('payment_id', offer.payment_id);

    if (paymentError) {
      console.error('Payment update error:', paymentError);
      return new Response(JSON.stringify({ error: 'Failed to update payment' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Update offer to completed
    const { error: offerUpdateError } = await supabaseAdmin
      .from('job_offers')
      .update({
        offer_status: 'completed',
        payment_status: 'paid',
        updated_at: new Date().toISOString()
      })
      .eq('offer_id', offer_id);

    if (offerUpdateError) {
      console.error('Offer update error:', offerUpdateError);
      return new Response(JSON.stringify({ error: 'Failed to update offer' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // ✅ No earnings table update needed - table has been removed
    // All payment info (including paid_at) is already in payments table

    logger.info('✅ Manual payment completion successful', {
      userId: user.id,
      offerId: offer_id,
      paymentId: offer.payment_id
    });

    return new Response(JSON.stringify({
      success: true,
      message: 'Payment manually marked as complete',
      offer_id: offer_id
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('❌ Manual completion error:', error);
    logger.error('Manual completion failed', { error: error.message });
    
    return new Response(JSON.stringify({ 
      error: 'Failed to complete payment manually',
      details: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});
