import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { checkProviderTokenStatus } from '@/lib/tokens';
import logger from '@/lib/logger';

// Helper to create JSON responses
function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

/**
 * GET /api/providers/check-token?offer_id=xxx
 * 
 * Check if provider needs to pay €5 token for a recurring job
 * WITHOUT marking the job complete.
 * 
 * This allows frontend to:
 * 1. Check token status
 * 2. Show payment modal if needed
 * 3. Process payment
 * 4. THEN mark job complete
 */
export async function GET(request: NextRequest) {
  try {
    // Get authenticated user
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ success: false, error: 'Missing or invalid authorization header' }, 401);
    }

    const token = authHeader.substring(7);
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return json({ success: false, error: 'Invalid token' }, 401);
    }

    // Get offer_id from query params
    const { searchParams } = new URL(request.url);
    const offerId = searchParams.get('offer_id');

    if (!offerId) {
      return json(
        { success: false, error: 'offer_id is required' },
        400
      );
    }

    // Get offer details to check if recurring
    const { data: offer, error: offerError } = await supabaseAdmin
      .from('offers')
      .select('is_recurring, provider_id, offer_status')
      .eq('offer_id', offerId)
      .single();

    if (offerError || !offer) {
      return json(
        { success: false, error: 'Offer not found' },
        404
      );
    }

    // Verify user is the provider
    if (offer.provider_id !== user.id) {
      return json({ success: false, error: 'Not authorized for this offer' }, 401);
    }

    // Only check token for recurring jobs
    if (!offer.is_recurring) {
      logger.info('Non-recurring job - no token needed', { offerId });
      return json({
        success: true,
        token_needed: false,
        status: 'not_applicable',
        message: 'Token not required for one-time jobs',
      });
    }

    // Check provider token status
    const tokenStatus = await checkProviderTokenStatus(user.id, offerId);

    logger.info('Provider token check (pre-mark-complete)', {
      offerId,
      providerId: user.id,
      status: tokenStatus.status,
    });

    return json({
      success: true,
      token_needed: tokenStatus.status === 'pending_checkout',
      ...tokenStatus,
    });
  } catch (error: any) {
    logger.error('Check provider token error', { error: error.message });
    return json(
      {
        success: false,
        error: error.message || 'Failed to check token status',
      },
      500
    );
  }
}
