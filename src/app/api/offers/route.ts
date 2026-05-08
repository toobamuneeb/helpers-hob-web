// GET: Get offers (customer bookings or provider jobs based on role)
// POST: Create a new offer (Hire Now)
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { rateLimitMiddleware } from '@/lib/rate-limiter'
import logger from '@/lib/logger'
import { z } from 'zod'
import { validateRequest } from '@/lib/validation'

const createOfferSchema = z.object({
  provider_id:         z.string().uuid(),
  skill_id:            z.string().uuid(),
  offer_title:         z.string().min(3).max(60),
  service_description: z.string().min(10).max(1000),
  location_address:    z.string().min(5).max(500),
  service_date:        z.string().datetime(), // Accept ISO datetime string
  service_time:        z.string().datetime(), // Accept ISO datetime string
  payment_amount:      z.number().positive().max(10000),
  chat_id:             z.string().uuid().optional(),
  job_id:              z.string().uuid().optional(),
  image_url:           z.string().url().optional(),
  location_lat:        z.number().optional(),
  location_lng:        z.number().optional(),
  service_duration:    z.string().optional(),
  currency:            z.string().length(3).default('EUR'),
  pay_through_platform: z.boolean().default(true),
  is_recurring:        z.boolean().default(false),
  recurrence_type:     z.enum(['daily','weekly','bi-weekly','monthly']).optional(),
  recurrence_end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

export const GET = requireAuth(async (request: NextRequest, user) => {
  const rl = await rateLimitMiddleware('general')(request)
  if (rl) return rl
  const { searchParams } = new URL(request.url)
  const limit = parseInt(searchParams.get('limit') || '50')
  const offset = parseInt(searchParams.get('offset') || '0')
  const status_filter = searchParams.get('status') || null
  const start_date = searchParams.get('start_date') || null
  const end_date = searchParams.get('end_date') || null

  const rpcName = user.role === 'customer' ? 'get_customer_job_offers' : 'get_provider_job_offers'
  const idParam = user.role === 'customer' ? 'p_customer_id' : 'p_provider_id'

  const rpcParams: any = {
    [idParam]: user.id,
    p_limit: limit,
    p_offset: offset,
    p_status_filter: status_filter,
  }

  // Date filter only for provider (calendar screen)
  if (user.role === 'service_provider') {
    rpcParams.p_start_date = start_date
    rpcParams.p_end_date = end_date
  }

  const { data, error } = await supabaseAdmin.rpc(rpcName, rpcParams)
  if (error) {
    logger.error('Failed to fetch offers', { error: error.message, rpcName, userId: user.id })
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
  return new Response(JSON.stringify({ success: true, data: data || [], pagination: { limit, offset, has_more: data && data.length === limit } }), { status: 200, headers: { 'Content-Type': 'application/json' } })
})

export const POST = requireAuth(async (request: NextRequest, user) => {
  if (user.role !== 'customer') return new Response(JSON.stringify({ error: 'Only customers can create offers' }), { status: 403, headers: { 'Content-Type': 'application/json' } })
  const rl = await rateLimitMiddleware('jobCreation')(request)
  if (rl) return rl
  const v = validateRequest(createOfferSchema, await request.json())
  if (!v.success) return new Response(JSON.stringify({ error: v.error }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  const d = v.data
  
  console.log('🔵 Creating offer with params:', {
    customer_id: user.id,
    provider_id: d.provider_id,
    skill_id: d.skill_id,
    service_date: d.service_date,
    service_time: d.service_time,
    is_recurring: d.is_recurring,
    recurrence_type: d.recurrence_type,
    recurrence_end_date: d.recurrence_end_date
  })
  
  const { data, error } = await supabaseAdmin.rpc('create_job_offer', {
    p_customer_id: user.id, p_provider_id: d.provider_id, p_skill_id: d.skill_id,
    p_offer_title: d.offer_title, p_service_description: d.service_description,
    p_location_address: d.location_address, p_service_date: d.service_date,
    p_service_time: d.service_time, p_payment_amount: d.payment_amount,
    p_chat_id: d.chat_id, p_job_id: d.job_id, p_image_url: d.image_url,
    p_location_lat: d.location_lat, p_location_lng: d.location_lng,
    p_service_duration: d.service_duration, p_currency: d.currency,
    p_pay_through_platform: d.pay_through_platform,
    p_is_recurring: d.is_recurring, p_recurrence_type: d.recurrence_type,
    p_recurrence_end_date: d.recurrence_end_date
  })
  
  if (error) {
    console.error('❌ Offer creation failed:', {
      error: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint
    })
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
  
  console.log('✅ Offer created successfully:', data)
  logger.info('Offer created', { userId: user.id, providerId: d.provider_id })
  return new Response(JSON.stringify({ success: true, data }), { status: 201, headers: { 'Content-Type': 'application/json' } })
})
