// POST: Create or get one-to-one chat between customer and provider
import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { rateLimitMiddleware } from '@/lib/rate-limiter'
import { z } from 'zod'
import { validateRequest } from '@/lib/validation'
import logger from '@/lib/logger'

const schema = z.object({
  customer_id:          z.string().uuid(),
  service_provider_id:  z.string().uuid(),
})

export const POST = async (request: NextRequest) => {
  const rl = await rateLimitMiddleware('general')(request)
  if (rl) return rl
  const v = validateRequest(schema, await request.json())
  if (!v.success) return new Response(JSON.stringify({ error: v.error }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  const { customer_id, service_provider_id } = v.data
  const { data, error } = await supabaseAdmin.rpc('create_or_get_chat', {
    p_customer_id: customer_id,
    p_service_provider_id: service_provider_id
  })
  if (error) {
    logger.error('Failed to create chat', { error })
    return new Response(JSON.stringify({ error: 'Failed to create chat' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
  return new Response(JSON.stringify({ success: true, data }), { status: 201, headers: { 'Content-Type': 'application/json' } })
}
