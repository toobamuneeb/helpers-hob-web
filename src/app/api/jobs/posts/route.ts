// GET: Get customer's job posts (My Jobs screen)
// POST: Create a new job post
import { NextRequest } from 'next/server'
import { requireRole, requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { rateLimitMiddleware } from '@/lib/rate-limiter'
import logger from '@/lib/logger'
import { z } from 'zod'
import { validateRequest } from '@/lib/validation'

const createPostSchema = z.object({
  skill_id:            z.string().uuid(),
  job_title:           z.string().min(3).max(60),
  service_description: z.string().min(10).max(1000),
  location_address:    z.string().min(5).max(500),
  location_lat:        z.number().optional(),
  location_lng:        z.number().optional(),
  service_date:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  service_time:        z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).optional(),
  service_duration:    z.string().optional(),
  payment_amount:      z.number().positive().optional(),
  image_url:           z.string().url().optional(),
  currency:            z.string().length(3).default('EUR'),
  is_recurring:        z.boolean().default(false),
  recurrence_type:     z.enum(['daily','weekly','bi-weekly','monthly']).optional(),
  recurrence_end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

export const GET = requireRole('customer')(async (request: NextRequest, user) => {
  const rl = await rateLimitMiddleware('general')(request)
  if (rl) return rl
  const { searchParams } = new URL(request.url)
  const limit = parseInt(searchParams.get('limit') || '20')
  const offset = parseInt(searchParams.get('offset') || '0')
  const { data, error } = await supabaseAdmin.rpc('get_customer_job_posts', {
    p_customer_id: user.id, p_limit: limit, p_offset: offset
  })
  if (error) return new Response(JSON.stringify({ error: 'Failed to fetch posts' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  return new Response(JSON.stringify({ success: true, data: data || [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
})

export const POST = requireRole('customer')(async (request: NextRequest, user) => {
  const rl = await rateLimitMiddleware('jobCreation')(request)
  if (rl) return rl
  const body = await request.json()
  const v = validateRequest(createPostSchema, body)
  if (!v.success) return new Response(JSON.stringify({ error: v.error }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  const d = v.data
  const { data, error } = await supabaseAdmin.rpc('create_job_post', {
    p_customer_id: user.id, p_skill_id: d.skill_id, p_job_title: d.job_title,
    p_service_description: d.service_description, p_location_address: d.location_address,
    p_location_lat: d.location_lat, p_location_lng: d.location_lng,
    p_service_date: d.service_date, p_service_time: d.service_time,
    p_service_duration: d.service_duration, p_payment_amount: d.payment_amount,
    p_image_url: d.image_url, p_currency: d.currency,
    p_is_recurring: d.is_recurring, p_recurrence_type: d.recurrence_type,
    p_recurrence_end_date: d.recurrence_end_date
  })
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  logger.info('Job post created', { userId: user.id })
  return new Response(JSON.stringify({ success: true, data }), { status: 201, headers: { 'Content-Type': 'application/json' } })
})
