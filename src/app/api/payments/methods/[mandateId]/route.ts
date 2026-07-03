/**
 * DELETE /api/payments/methods/[mandateId]
 * Delete (revoke) a saved payment method for the customer
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { deletePaymentMethod } from '../../../../../lib/mollie';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ mandateId: string }> } 
) {

  try {
    // Get user from JWT token
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { success: false, error: 'No authorization token' },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      console.error('❌ Auth error:', authError);
      return NextResponse.json(
        { success: false, error: 'Invalid token' },
        { status: 401 }
      );
    }

    const { mandateId } = await params;

    if (!mandateId) {
      return NextResponse.json(
        { success: false, error: 'Mandate ID is required' },
        { status: 400 }
      );
    }

    console.log('🔵 delete-payment-method - User ID:', user.id, 'Mandate ID:', mandateId);

    // Get customer's Mollie customer ID
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('mollie_customer_id')
      .eq('user_id', user.id)
      .single();

    if (profileError || !profile?.mollie_customer_id) {
      console.log('⚠️ No Mollie customer ID found for user');
      return NextResponse.json(
        { success: false, error: 'No Mollie customer found' },
        { status: 404 }
      );
    }

    console.log('🔵 Mollie customer ID:', profile.mollie_customer_id);

    // Revoke the mandate in Mollie
    await deletePaymentMethod(profile.mollie_customer_id, mandateId);

    console.log('✅ Payment method deleted:', mandateId);

    return NextResponse.json({
      success: true,
      message: 'Payment method removed successfully',
    });

  } catch (error: any) {
    console.error('❌ Delete payment method error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to delete payment method' },
      { status: 500 }
    );
  }
}
