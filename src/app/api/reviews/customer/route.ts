// POST: Customer reviews provider after completed offer
import { NextRequest } from 'next/server'
import { requireRole } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { rateLimitMiddleware } from '@/lib/rate-limiter'
import { z } from 'zod'
import { validateRequest } from '@/lib/validation'

const schema = z.object({
  offer_id:               z.string().uuid(),
  customer_rating:        z.number().int().min(1).max(5),
  skill_rating:           z.number().int().min(1).max(5),
  communication_rating:   z.number().int().min(1).max(5),
  punctuality_rating:     z.number().int().min(1).max(5),
  professionalism_rating: z.number().int().min(1).max(5),
  review_title:           z.string().max(200).optional(),
  review_text:            z.string().max(2000).optional(),
  is_anonymous:           z.boolean().default(false),
})

export const POST = requireRole('customer')(async (request: NextRequest, user) => {
  const rl = await rateLimitMiddleware('general')(request)
  if (rl) return rl
  const v = validateRequest(schema, await request.json())
  if (!v.success) return new Response(JSON.stringify({ error: v.error }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  const d = v.data
  const { data, error } = await supabaseAdmin.rpc('create_offer_customer_review', {
    p_offer_id: d.offer_id, p_customer_id: user.id,
    p_customer_rating: d.customer_rating, p_skill_rating: d.skill_rating,
    p_communication_rating: d.communication_rating, p_punctuality_rating: d.punctuality_rating,
    p_professionalism_rating: d.professionalism_rating,
    p_review_title: d.review_title, p_review_text: d.review_text, p_is_anonymous: d.is_anonymous
  })
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  return new Response(JSON.stringify({ success: true, data }), { status: 201, headers: { 'Content-Type': 'application/json' } })
})
