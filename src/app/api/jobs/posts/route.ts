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
  service_date:        z.string().datetime().optional(), // ISO datetime string (TIMESTAMPTZ)
  service_time:        z.string().datetime().optional(), // ISO datetime string (TIMESTAMPTZ)
  service_duration:    z.string().optional(),
  payment_amount:      z.number().positive().optional(),
  image_url:           z.string().url().optional(),
  // Photos are optional and there can be several. image_url stays in the
  // schema because the mobile app still sends it on older builds.
  image_urls:          z.array(z.string().url()).max(10).optional(),
  currency:            z.string().length(3).default('EUR'),
  is_recurring:        z.boolean().default(false),
  recurrence_type:     z.enum(['daily','weekly','bi-weekly','monthly']).optional(),
  recurrence_end_date: z.string().datetime().optional(), // ISO datetime string (TIMESTAMPTZ)
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
  
  console.log('🔵 Creating job post with body:', JSON.stringify(body, null, 2))
  
  const v = validateRequest(createPostSchema, body)
  if (!v.success) {
    console.log('❌ Validation failed:', v.error)
    return new Response(JSON.stringify({ error: v.error }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }
  
  const d = v.data
  console.log('✅ Validation passed, calling create_job_post with:', {
    p_customer_id: user.id,
    p_skill_id: d.skill_id,
    p_job_title: d.job_title,
    p_service_date: d.service_date,
    p_service_time: d.service_time,
    p_is_recurring: d.is_recurring,
    p_recurrence_type: d.recurrence_type,
    p_recurrence_end_date: d.recurrence_end_date
  })
  
  const { data, error } = await supabaseAdmin.rpc('create_job_post', {
    p_customer_id: user.id, p_skill_id: d.skill_id, p_job_title: d.job_title,
    p_service_description: d.service_description, p_location_address: d.location_address,
    p_location_lat: d.location_lat, p_location_lng: d.location_lng,
    p_service_date: d.service_date, p_service_time: d.service_time,
    p_service_duration: d.service_duration, p_payment_amount: d.payment_amount,
    p_image_url: d.image_urls?.[0] ?? d.image_url, p_currency: d.currency,
    p_is_recurring: d.is_recurring, p_recurrence_type: d.recurrence_type,
    p_recurrence_end_date: d.recurrence_end_date
  })
  
  if (error) {
    console.error('❌ Database error:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint
    })
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
  
  // The RPC only takes a single image_url, and reproducing its body here to add
  // a parameter would mean guessing at what is actually deployed. The full list
  // is written straight after instead; the sync trigger keeps image_url in step.
  if (d.image_urls?.length) {
    const jobId = (data as { job_id?: string } | null)?.job_id
      ?? (Array.isArray(data) ? (data[0] as { job_id?: string })?.job_id : undefined)
    if (jobId) {
      const { error: imgError } = await supabaseAdmin
        .from('jobs')
        .update({ image_urls: d.image_urls })
        .eq('job_id', jobId)
      // The post exists and is usable without the extra photos, so this is
      // logged rather than failed — losing the job over a thumbnail is worse.
      if (imgError) logger.error?.('Job photos not saved', { jobId, error: imgError.message })
    }
  }

  console.log('✅ Job post created successfully:', data)
  logger.info('Job post created', { userId: user.id })
  return new Response(JSON.stringify({ success: true, data }), { status: 201, headers: { 'Content-Type': 'application/json' } })
})
