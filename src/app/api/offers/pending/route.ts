// GET: Pending offers for provider (Offers screen)
import { NextRequest } from 'next/server'
import { requireRole } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { rateLimitMiddleware } from '@/lib/rate-limiter'

export const GET = requireRole('service_provider')(async (request: NextRequest, user) => {
  const rl = await rateLimitMiddleware('general')(request)
  if (rl) return rl
  const { searchParams } = new URL(request.url)
  const limit = parseInt(searchParams.get('limit') || '20')
  const offset = parseInt(searchParams.get('offset') || '0')
  const { data, error } = await supabaseAdmin.rpc('get_pending_offers_for_provider', {
    p_provider_id: user.id, p_limit: limit, p_offset: offset
  })
  if (error) return new Response(JSON.stringify({ error: 'Failed to fetch pending offers' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  return new Response(JSON.stringify({ success: true, data: data || [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
})
