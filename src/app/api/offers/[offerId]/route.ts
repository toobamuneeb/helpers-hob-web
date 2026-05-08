// POST actions on a specific offer
// Actions: accept, reject, start, mark-awaiting, mark-complete-provider, complete, cancel
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { rateLimitMiddleware } from '@/lib/rate-limiter'
import logger from '@/lib/logger'
import { z } from 'zod'
import { validateRequest } from '@/lib/validation'

const actionSchema = z.object({
  action: z.enum(['accept', 'reject', 'start', 'mark-awaiting', 'mark-complete-provider', 'complete', 'cancel', 'mark-not-completed']),
  reason: z.string().optional(),
  cancel_series: z.boolean().optional().default(false),
})

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
      // offer_status: active → awaiting_confirmation (provider done, waiting customer)
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

  logger.info('Offer action', { action, offerId, userId: user.id })
  return new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { 'Content-Type': 'application/json' } })
})
