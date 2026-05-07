// GET: Customer public profile
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { rateLimitMiddleware } from '@/lib/rate-limiter'

export const GET = requireAuth(async (
  request: NextRequest,
  user,
  context?: { params?: Promise<{ id: string }> }
) => {
  const rl = await rateLimitMiddleware('general')(request)
  if (rl) return rl

  const { id } = await (context?.params ?? Promise.resolve({ id: '' }))
  if (!id) return new Response(JSON.stringify({ error: 'id required' }), { status: 400, headers: { 'Content-Type': 'application/json' } })

  const { data, error } = await supabaseAdmin.rpc('get_customer_profile', { p_customer_id: id })
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  if (!data) return new Response(JSON.stringify({ error: 'Customer not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } })

  return new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { 'Content-Type': 'application/json' } })
})
