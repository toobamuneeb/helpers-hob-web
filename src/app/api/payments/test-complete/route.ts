// TEST ENDPOINT: Manually complete payment for local testing
// Use this when webhook cannot be reached in local development
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

export const POST = requireAuth(async (request: NextRequest, user) => {
  // Only allow in development
  if (process.env.NODE_ENV === 'production') {
    return new Response(JSON.stringify({ error: 'Not available in production' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  try {
    const body = await request.json()
    const { payment_id } = body

    if (!payment_id) {
      return new Response(JSON.stringify({ error: 'payment_id required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Manually update payment status to simulate webhook
    const { data, error } = await supabaseAdmin.rpc(
      'update_payment_status',
      {
        p_payment_id: payment_id,
        p_mollie_status: 'paid',
        p_mollie_payment_id: `test_${payment_id}`,
        p_mollie_metadata: { test: true },
      }
    )

    if (error) {
      console.error('Failed to complete payment:', error)
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    console.log('✅ TEST: Payment manually completed:', payment_id)

    return new Response(JSON.stringify({
      success: true,
      message: 'Payment marked as paid (TEST MODE)',
      payment_id,
      data,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (error: any) {
    console.error('Test payment completion error:', error)
    
    return new Response(JSON.stringify({ 
      error: 'Failed to complete payment',
      details: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
