// GET /api/offers/[offerId] - Get offer details by ID
// POST /api/offers/[offerId] - Perform actions on offer
// Actions: accept, reject, start, mark-awaiting, mark-complete-provider, complete, cancel
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { rateLimitMiddleware } from '@/lib/rate-limiter'
import logger from '@/lib/logger'
import { z } from 'zod'
import { validateRequest } from '@/lib/validation'
import { checkProviderTokenStatus } from '@/lib/tokens'

const actionSchema = z.object({
  action: z.enum(['accept', 'reject', 'start', 'mark-awaiting', 'mark-complete-provider', 'complete', 'cancel', 'mark-not-completed']),
  reason: z.string().optional(),
  cancel_series: z.boolean().optional().default(false),
})

// GET - Fetch offer details
export const GET = requireAuth(async (
  request: NextRequest,
  user,
  context?: { params?: Promise<{ offerId: string }> }
) => {
  const rl = await rateLimitMiddleware('general')(request)
  if (rl) return rl

  const { offerId } = await (context?.params ?? Promise.resolve({ offerId: '' }))
  if (!offerId) {
    return new Response(JSON.stringify({ error: 'Offer ID required' }), { 
      status: 400, 
      headers: { 'Content-Type': 'application/json' } 
    })
  }

  try {
    // Fetch offer with all related data
    const { data, error } = await supabaseAdmin
      .from('job_offers')
      .select(`
        *,
        customer:profiles!job_offers_customer_id_fkey(user_id, name, profile_image_url),
        provider:profiles!job_offers_provider_id_fkey(user_id, name, profile_image_url),
        skill:skills(id, name, icon, color)
      `)
      .eq('offer_id', offerId)
      .single()

    if (error) {
      logger.error('Failed to fetch offer', { error: error.message, offerId, userId: user.id })
      return new Response(JSON.stringify({ error: error.message }), { 
        status: 500, 
        headers: { 'Content-Type': 'application/json' } 
      })
    }

    if (!data) {
      return new Response(JSON.stringify({ error: 'Offer not found' }), { 
        status: 404, 
        headers: { 'Content-Type': 'application/json' } 
      })
    }

    // Check for reviews separately
    const { data: customerReview } = await supabaseAdmin
      .from('job_reviews')
      .select('review_id')
      .eq('offer_id', offerId)
      .eq('reviewer_role', 'customer')
      .maybeSingle()

    const { data: providerReview } = await supabaseAdmin
      .from('job_reviews')
      .select('review_id')
      .eq('offer_id', offerId)
      .eq('reviewer_role', 'service_provider')
      .maybeSingle()

    // Format response
    const formatted = {
      ...data,
      // Skill info
      skill_name: data.skill?.name,
      skill_color: data.skill?.color,
      skill_icon: data.skill?.icon,
      // Customer info
      customer_id: data.customer?.user_id,
      customer_name: data.customer?.name,
      customer_avatar: data.customer?.profile_image_url,
      // Provider info
      provider_id: data.provider?.user_id,
      provider_name: data.provider?.name,
      provider_avatar: data.provider?.profile_image_url,
      // Review flags
      has_customer_review: !!customerReview,
      has_provider_review: !!providerReview,
    }

    logger.info('Offer fetched', { offerId, userId: user.id })
    return new Response(JSON.stringify({ success: true, data: formatted }), { 
      status: 200, 
      headers: { 'Content-Type': 'application/json' } 
    })
  } catch (err: any) {
    logger.error('Offer fetch error', { error: err.message, offerId, userId: user.id })
    return new Response(JSON.stringify({ error: 'Internal server error' }), { 
      status: 500, 
      headers: { 'Content-Type': 'application/json' } 
    })
  }
})

// POST - Perform actions on offer
export const POST = requireAuth(async (
  request: NextRequest,
  user,
  context?: { params?: Promise<{ offerId: string }> }
) => {
  const rl = await rateLimitMiddleware('general')(request)
  if (rl) return rl

  const { offerId } = await (context?.params ?? Promise.resolve({ offerId: '' }))
  if (!offerId) return new Response(JSON.stringify({ error: 'Offer ID required' }), { status: 400, headers: { 'Content-Type': 'application/json' } })

  const v = validateRequest(actionSchema, await request.json())
  if (!v.success) return new Response(JSON.stringify({ error: v.error }), { status: 400, headers: { 'Content-Type': 'application/json' } })

  const { action, reason, cancel_series } = v.data
  let data: any, error: any

  switch (action) {
    case 'accept':
      // offer_job_status: pending → accepted | offer_status: → scheduled
      ;({ data, error } = await supabaseAdmin.rpc('accept_job_offer', { p_offer_id: offerId, p_provider_id: user.id }))
      break
    case 'reject':
      // offer_job_status: pending → rejected | offer_status: → canceled
      ;({ data, error } = await supabaseAdmin.rpc('reject_job_offer', { p_offer_id: offerId, p_provider_id: user.id }))
      break
    case 'start':
      // offer_status: scheduled → pending (job started, provider on way)
      ;({ data, error } = await supabaseAdmin.rpc('start_job_offer', { p_offer_id: offerId, p_provider_id: user.id }))
      break
    case 'mark-awaiting':
      // offer_status: pending → active (provider arrived)
      ;({ data, error } = await supabaseAdmin.rpc('mark_offer_awaiting_confirmation', { p_offer_id: offerId, p_provider_id: user.id }))
      break
    case 'mark-complete-provider':
      // Check token FIRST for recurring jobs (before marking complete)
      try {
        const { data: offer } = await supabaseAdmin
          .from('job_offers')
          .select('is_recurring, provider_id')
          .eq('offer_id', offerId)
          .single()
        
        if (offer?.is_recurring && offer.provider_id === user.id) {
          const tokenStatus = await checkProviderTokenStatus(user.id, offerId)
          logger.info('Token check before mark-complete', { offerId, status: tokenStatus.status })
          
          if (tokenStatus.status === 'pending_checkout') {
            // Token needed! Don't mark complete yet
            logger.info('Token payment required - not marking complete yet', { offerId })
            return new Response(
              JSON.stringify({ 
                success: false, 
                error: 'TOKEN_REQUIRED',
                token_required: true,
                provider_token: tokenStatus,
                message: 'Please pay €5 monthly token first'
              }), 
              { status: 402, headers: { 'Content-Type': 'application/json' } }
            )
          }
        }
      } catch (tokErr: any) {
        logger.warn('Token check failed before mark-complete', { offerId, error: tokErr.message })
      }
      
      // Token paid or not needed - NOW mark complete
      ;({ data, error } = await supabaseAdmin.rpc('mark_offer_complete_by_provider', { p_offer_id: offerId, p_provider_id: user.id }))
      break
    case 'complete':
      // offer_status: awaiting_confirmation → completed (customer confirms)
      ;({ data, error } = await supabaseAdmin.rpc('mark_offer_complete_by_customer', { p_offer_id: offerId, p_customer_id: user.id }))
      break
    case 'mark-not-completed':
      // offer_status: awaiting_confirmation → active (customer marks not completed)
      ;({ data, error } = await supabaseAdmin.rpc('mark_offer_not_completed', { p_offer_id: offerId, p_customer_id: user.id }))
      break
    case 'cancel':
      ;({ data, error } = await supabaseAdmin.rpc('cancel_job_offer', {
        p_offer_id: offerId, p_user_id: user.id,
        p_reason: reason, p_cancel_series: cancel_series
      }))
      break
  }

  if (error) {
    logger.error('Offer action failed', { error, action, offerId, userId: user.id })
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }

  logger.info('Offer action success', { action, offerId, userId: user.id })
  return new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { 'Content-Type': 'application/json' } })
})
