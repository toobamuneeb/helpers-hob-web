// POST: Provider reviews customer after completed offer
import { NextRequest } from 'next/server'
import { requireRole } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { rateLimitMiddleware } from '@/lib/rate-limiter'
import { z } from 'zod'
import { validateRequest } from '@/lib/validation'

const schema = z.object({
  offer_id:      z.string().uuid(),
  provider_rating: z.number().int().min(1).max(5),
  review_title:  z.string().max(200).optional(),
  review_text:   z.string().max(2000).optional(),
  is_anonymous:  z.boolean().default(false),
})

export const POST = requireRole('service_provider')(async (request: NextRequest, user) => {
  const rl = await rateLimitMiddleware('general')(request)
  if (rl) return rl
  const v = validateRequest(schema, await request.json())
  if (!v.success) return new Response(JSON.stringify({ error: v.error }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  const d = v.data
  const { data, error } = await supabaseAdmin.rpc('create_offer_provider_review', {
    p_offer_id: d.offer_id,
    p_provider_id: user.id,
    p_provider_rating: d.provider_rating,
    p_review_title: d.review_title,
    p_review_text: d.review_text,
    p_is_anonymous: d.is_anonymous,
  })
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  return new Response(JSON.stringify({ success: true, data }), { status: 201, headers: { 'Content-Type': 'application/json' } })
})
