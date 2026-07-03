// POST: Mollie payment webhook
// Called by Mollie when payment status changes
import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getPaymentStatus, validateWebhook } from '@/lib/mollie'
import logger from '@/lib/logger'

export const POST = async (request: NextRequest) => {
  try {
    // Mollie sends webhook data as form-encoded, not JSON
    const contentType = request.headers.get('content-type') || '';
    let molliePaymentId: string;

    if (contentType.includes('application/x-www-form-urlencoded')) {
      // Parse form data
      const formData = await request.formData();
      molliePaymentId = formData.get('id') as string;
    } else {
      // Fallback to JSON
      const body = await request.json();
      molliePaymentId = body.id;
    }

    if (!molliePaymentId || !validateWebhook(molliePaymentId)) {
      return new Response(JSON.stringify({ error: 'Invalid webhook' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // The payment is created on the PLATFORM account (routing model), so the
    // platform API key can fetch it directly.
    const molliePayment = await getPaymentStatus(molliePaymentId)

    // Get our payment record
    const { data: payment, error: fetchError } = await supabaseAdmin
      .from('payments')
      .select('payment_id, offer_id, payer_id')
      .eq('mollie_payment_id', molliePaymentId)
      .single()

    if (fetchError || !payment) {
      logger.error('Payment not found for webhook', { molliePaymentId })
      return new Response(JSON.stringify({ error: 'Payment not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Update payment status in database
    const { error: updateError } = await supabaseAdmin.rpc(
      'update_payment_status',
      {
        p_payment_id: payment.payment_id,
        p_mollie_status: molliePayment.status,
        p_mollie_payment_id: molliePaymentId,
        p_mollie_metadata: molliePayment.metadata || null,
      }
    )

    if (updateError) {
      logger.error('Failed to update payment status', { 
        paymentId: payment.payment_id,
        error: updateError.message 
      })
      
      return new Response(JSON.stringify({ error: 'Update failed' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    logger.info('✅ Payment webhook processed', {
      paymentId: payment.payment_id,
      mollieId: molliePaymentId,
      status: molliePayment.status,
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (error: any) {
    logger.error('❌ Webhook processing error', { error: error.message })
    
    return new Response(JSON.stringify({ 
      error: 'Webhook processing failed',
      details: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

// Allow Mollie to call this endpoint without authentication
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
