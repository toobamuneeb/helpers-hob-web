// GET: Check provider's Mollie Connect onboarding status
import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { checkProviderOnboardingStatus, getValidProviderToken } from '@/lib/mollie';

export const GET = async (request: NextRequest) => {
  try {
    // Get Authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('🔴 mollie-status - No auth header');
      return new Response(JSON.stringify({
        success: false,
        error: 'Unauthorized'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const token = authHeader.split(' ')[1];
    
    // Verify token with Supabase
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !user) {
      console.log('🔴 mollie-status - Invalid token:', authError?.message);
      return new Response(JSON.stringify({
        success: false,
        error: 'Unauthorized - invalid token'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const userId = user.id;
    console.log('🔵 mollie-status - user.id from token:', userId);

    // Get provider's bank details from new table
    // maybeSingle(): a provider with no bank_details row yet is a normal
    // "not connected" state, not an error. single() would raise PGRST116
    // ("Cannot coerce the result to a single JSON object") on zero rows.
    const { data: bankDetails, error: queryError } = await supabaseAdmin
      .from('provider_bank_details')
      .select('provider_id, mollie_connect_id, mollie_connect_status, bank_verified')
      .eq('provider_id', userId)
      .maybeSingle();

    console.log('🔵 mollie-status - query result:', {
      userId,
      hasBankDetails: !!bankDetails,
      mollieConnectId: bankDetails?.mollie_connect_id,
      status: bankDetails?.mollie_connect_status,
      queryError: queryError?.message,
      queryCode: queryError?.code,
    });

    if (!bankDetails || !bankDetails.mollie_connect_id) {
      return new Response(JSON.stringify({
        success: true,
        connected: false,
        status: 'not_started',
        can_receive_payments: false,
        can_receive_settlements: false,
        bank_verified: false,
        message: 'Not connected to Mollie yet'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Detect test mode from API key
    const isTestMode = process.env.MOLLIE_API_KEY?.startsWith('test_');

    // Fetch the LIVE onboarding status from Mollie using the provider's stored
    // OAuth token (auto-refreshed when expired). This is what makes a provider
    // who completes KYC later actually flip to 'active'.
    let status: { status: string; canReceivePayments: boolean; canReceiveSettlements: boolean; message: string; dashboardUrl: string | null } | null = null;
    try {
      const accessToken = await getValidProviderToken(userId);
      if (accessToken) {
        status = await checkProviderOnboardingStatus(accessToken);
      }
    } catch (statusError: any) {
      console.warn('⚠️ Live onboarding status lookup failed:', statusError.message);
    }

    const canReceivePayments = isTestMode ? true : (status?.canReceivePayments ?? false);
    const canReceiveSettlements = isTestMode ? true : (status?.canReceiveSettlements ?? false);
    const shouldBeActive = canReceivePayments;

    // 'active' when payments can be received; otherwise surface Mollie's raw
    // status ('needs-data' / 'in-review') so the UI can guide the next step.
    const effectiveStatus = shouldBeActive
      ? 'active'
      : (status?.status || bankDetails.mollie_connect_status || 'pending');

    // Persist any change so other flows (payment routing) see fresh values.
    if (
      effectiveStatus !== bankDetails.mollie_connect_status ||
      canReceiveSettlements !== bankDetails.bank_verified
    ) {
      console.log('🔵 Updating provider onboarding status', {
        userId,
        from: bankDetails.mollie_connect_status,
        to: effectiveStatus,
        canReceivePayments,
        canReceiveSettlements,
      });

      await supabaseAdmin
        .from('provider_bank_details')
        .update({
          mollie_connect_status: effectiveStatus,
          bank_verified: canReceiveSettlements,
          updated_at: new Date().toISOString(),
        })
        .eq('provider_id', userId);
    }

    return new Response(JSON.stringify({
      success: true,
      connected: true,
      status: effectiveStatus,
      can_receive_payments: canReceivePayments,
      can_receive_settlements: canReceiveSettlements,
      mollie_connect_id: bankDetails.mollie_connect_id,
      bank_verified: canReceiveSettlements,
      message: isTestMode ? 'Test mode — payments enabled.' : (status?.message || 'Checking your Mollie onboarding status…'),
      // Mollie Dashboard URL where the provider can finish/resume onboarding.
      dashboard_url: status?.dashboardUrl || null,
      test_mode: isTestMode, // Flag so frontend knows
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('❌ Status check error:', error);
    
    return new Response(JSON.stringify({ 
      error: 'Failed to check status',
      details: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
