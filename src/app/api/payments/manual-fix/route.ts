// POST: Manually fix payment status (for testing)
// Use when webhook fails or payment status needs manual update

import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getPaymentStatus } from '@/lib/mollie';
import logger from '@/lib/logger';
import { z } from 'zod';
import { validateRequest } from '@/lib/validation';

const fixSchema = z.object({
  mollie_payment_id: z.string(),
});

export const POST = async (request: NextRequest) => {
  const body = await request.json();
  const v = validateRequest(fixSchema, body);
  
  if (!v.success) {
    return new Response(JSON.stringify({ error: v.error }), { 
      status: 400,
      headers: { 'Content-Type': 'application/json' } 
    });
  }

  try {
    const molliePaymentId = v.data.mollie_payment_id;
    
    console.log('🔧 Manual fix for payment:', molliePaymentId);
    
    // Get payment status from Mollie
    const molliePayment = await getPaymentStatus(molliePaymentId);
    
    console.log('Mollie payment status:', molliePayment.status);

    // Find payment in our database by metadata or created around same time
    const { data: payment, error: fetchError } = await supabaseAdmin
      .from('payments')
      .select('payment_id, offer_id, mollie_payment_id, payment_status')
      .or(`mollie_payment_id.eq.${molliePaymentId},mollie_payment_id.is.null`)
      .order('created_at', { ascending: false })
      .limit(5);

    if (fetchError || !payment || payment.length === 0) {
      logger.error('No payments found to fix', { molliePaymentId });
      return new Response(JSON.stringify({ 
        error: 'No recent payments found',
        suggestion: 'Check if payment was created in database'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Find the payment without mollie_payment_id or with matching ID
    const targetPayment = payment.find(p => 
      !p.mollie_payment_id || p.mollie_payment_id === molliePaymentId
    );

    if (!targetPayment) {
      return new Response(JSON.stringify({ 
        error: 'Could not identify payment to fix',
        found_payments: payment.length
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log('Found payment to fix:', targetPayment.payment_id);

    // Update payment status
    const { error: updateError } = await supabaseAdmin.rpc(
      'update_payment_status',
      {
        p_payment_id: targetPayment.payment_id,
        p_mollie_status: molliePayment.status,
        p_mollie_payment_id: molliePaymentId,
        p_mollie_metadata: molliePayment.metadata || null,
      }
    );

    if (updateError) {
      logger.error('Failed to update payment status', { 
        paymentId: targetPayment.payment_id,
        error: updateError.message 
      });
      
      return new Response(JSON.stringify({ 
        error: 'Failed to update payment',
        details: updateError.message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    logger.info('✅ Payment manually fixed', {
      paymentId: targetPayment.payment_id,
      mollieId: molliePaymentId,
      status: molliePayment.status,
    });

    return new Response(JSON.stringify({ 
      success: true,
      payment_id: targetPayment.payment_id,
      mollie_payment_id: molliePaymentId,
      old_status: targetPayment.payment_status,
      new_status: molliePayment.status,
      message: 'Payment status updated successfully'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    logger.error('Manual fix error', { error: error.message });
    
    return new Response(JSON.stringify({ 
      error: 'Manual fix failed',
      details: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
