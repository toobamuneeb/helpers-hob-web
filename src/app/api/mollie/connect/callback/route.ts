// GET: Mollie OAuth callback - handles provider authorization
// This is called by Mollie after provider authorizes the connection
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import logger from '@/lib/logger';
import {
  exchangeCodeForTokens,
  ensureProviderProfileAndMethods,
  checkProviderOnboardingStatus,
} from '@/lib/mollie';

export const GET = async (request: NextRequest) => {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const providerId = searchParams.get('state'); // Provider ID passed in state
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    // Check if user denied authorization
    if (error) {
      logger.error('Provider denied Mollie authorization', {
        providerId,
        error,
        errorDescription,
      });

      // Redirect back to app with error
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      return NextResponse.redirect(
        `${appUrl}/bank-details?status=cancelled&message=${encodeURIComponent(errorDescription || 'Authorization cancelled')}`
      );
    }

    // Validate required parameters
    if (!code || !providerId) {
      logger.error('Missing OAuth callback parameters', { code: !!code, providerId: !!providerId });
      
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      return NextResponse.redirect(
        `${appUrl}/bank-details?status=error&message=${encodeURIComponent('Invalid callback parameters')}`
      );
    }

    // Check if Partner credentials are configured
    const clientId = process.env.MOLLIE_PARTNER_CLIENT_ID;
    const clientSecret = process.env.MOLLIE_PARTNER_CLIENT_SECRET;
    const platformId = process.env.MOLLIE_PLATFORM_ID;

    if (!clientId || !clientSecret || !platformId) {
      logger.error('Partner credentials not configured', { providerId });
      
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      return NextResponse.redirect(
        `${appUrl}/bank-details?status=error&message=${encodeURIComponent('Partner credentials not configured')}`
      );
    }

    logger.info('Processing OAuth callback', { providerId });

    // Step 1: Exchange authorization code for access + refresh tokens
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/mollie/connect/callback`;

    let tokens: { accessToken: string; refreshToken: string | null; expiresAt: string | null };
    try {
      tokens = await exchangeCodeForTokens(code, redirectUri);
    } catch (tokenError: any) {
      logger.error('Failed to exchange OAuth code', { providerId, error: tokenError.message });
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      return NextResponse.redirect(
        `${appUrl}/bank-details?status=error&message=${encodeURIComponent('Failed to authorize with Mollie')}`
      );
    }

    logger.info('Successfully obtained access token', {
      providerId,
      hasAccessToken: !!tokens.accessToken,
      hasRefreshToken: !!tokens.refreshToken,
    });

    // Step 2: Get provider's organization details from Mollie
    const orgResponse = await fetch('https://api.mollie.com/v2/organizations/me', {
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
      },
    });

    if (!orgResponse.ok) {
      const errorData = await orgResponse.text();
      logger.error('Failed to fetch organization details', {
        providerId,
        status: orgResponse.status,
        error: errorData,
      });

      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      return NextResponse.redirect(
        `${appUrl}/bank-details?status=error&message=${encodeURIComponent('Failed to fetch organization details')}`
      );
    }

    const org = await orgResponse.json();

    logger.info('Successfully fetched organization', {
      providerId,
      organizationId: org.id,
      organizationName: org.name,
    });

    // Step 3: Ensure a payment profile exists with our methods enabled, so the
    // provider can accept payments as soon as onboarding allows. Best-effort.
    const profileResult = await ensureProviderProfileAndMethods(tokens.accessToken, {
      name: org.name,
      email: org.email,
    });
    logger.info('Profile / payment methods ensured', {
      providerId,
      profileId: profileResult.profileId,
      enabledMethods: profileResult.enabledMethods,
      warnings: profileResult.warnings,
    });

    // Step 4: Read the LIVE onboarding status (KYC + capabilities)
    let onboarding: { status: string; canReceivePayments: boolean; canReceiveSettlements: boolean };
    try {
      onboarding = await checkProviderOnboardingStatus(tokens.accessToken);
    } catch (statusError: any) {
      logger.warn('Failed to fetch onboarding status, defaulting to needs-data', {
        providerId,
        error: statusError.message,
      });
      onboarding = { status: 'needs-data', canReceivePayments: false, canReceiveSettlements: false };
    }

    // In test mode Mollie can't truly complete KYC — treat as ready so the local
    // payment/routing flow works. In live mode use the real capability flags.
    const isTestMode = process.env.MOLLIE_API_KEY?.startsWith('test_');
    const canReceivePayments = isTestMode ? true : onboarding.canReceivePayments;
    const canReceiveSettlements = isTestMode ? true : onboarding.canReceiveSettlements;

    // 'active' once the org can actually take payments; keep Mollie's raw status
    // ('needs-data' / 'in-review') otherwise so the UI can show the right step.
    const connectStatus = canReceivePayments ? 'active' : onboarding.status;

    logger.info('Onboarding status resolved', {
      providerId,
      organizationId: org.id,
      mollieStatus: onboarding.status,
      connectStatus,
      canReceivePayments,
      canReceiveSettlements,
      isTestMode,
    });

    // Step 5: Upsert database with real organization ID, tokens, and onboarding status
    const { data: upsertData, error: upsertError } = await supabaseAdmin
      .from('provider_bank_details')
      .upsert({
        provider_id: providerId,                      // Primary key for upsert
        mollie_connect_id: org.id,                    // Real Mollie Organization ID (not org_pending_)
        mollie_connect_status: connectStatus,         // 'active' when payments can be received
        bank_verified: canReceiveSettlements,         // Settlements ready => bank details verified
        mollie_access_token: tokens.accessToken,      // Save for future API calls (should encrypt in production)
        mollie_refresh_token: tokens.refreshToken,    // Save for token refresh
        token_expires_at: tokens.expiresAt,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'provider_id', // Update if exists, insert if not
      });

    console.log('🔵 Upsert result:', {
      success: !upsertError,
      error: upsertError?.message,
      code: upsertError?.code,
      details: upsertError?.details,
      data: upsertData,
    });

    if (upsertError) {
      logger.error('Failed to upsert provider bank details', {
        providerId,
        error: upsertError.message,
        code: upsertError.code,
        details: upsertError.details,
      });

      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      return NextResponse.redirect(
        `${appUrl}/bank-details?status=error&message=${encodeURIComponent('Failed to save bank details: ' + upsertError.message)}`
      );
    }

    logger.info('✅ Provider successfully connected to Mollie', {
      providerId,
      organizationId: org.id,
      connectStatus,
      canReceivePayments,
      canReceiveSettlements,
    });

    // Step 5: Redirect back to app with success
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    return NextResponse.redirect(
      `${appUrl}/bank-details?status=success&message=${encodeURIComponent('Successfully connected to Mollie!')}`
    );

  } catch (error: any) {
    logger.error('OAuth callback error', {
      error: error.message,
      stack: error.stack,
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    return NextResponse.redirect(
      `${appUrl}/bank-details?status=error&message=${encodeURIComponent('An unexpected error occurred')}`
    );
  }
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
