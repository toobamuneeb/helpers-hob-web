// GET: Reviews for a user (provider or customer)
// ?role=service_provider|customer&skill_id=...&limit=...&offset=...
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { rateLimitMiddleware } from '@/lib/rate-limiter'

export const GET = requireAuth(async (
  request: NextRequest,
  user,
  context?: { params?: Promise<{ userId: string }> }
) => {
  const rl = await rateLimitMiddleware('general')(request)
  if (rl) return rl

  const { userId } = await (context?.params ?? Promise.resolve({ userId: '' }))
  if (!userId) return new Response(JSON.stringify({ error: 'userId required' }), { status: 400, headers: { 'Content-Type': 'application/json' } })

  const url      = new URL(request.url)
  const role     = url.searchParams.get('role') ?? 'service_provider'
  const skillId  = url.searchParams.get('skill_id') ?? null
  const limit    = parseInt(url.searchParams.get('limit')  ?? '20')
  const offset   = parseInt(url.searchParams.get('offset') ?? '0')

  const { data, error } = await supabaseAdmin.rpc('get_my_reviews', {
    p_user_id:  userId,
    p_role:     role,
    p_skill_id: skillId,
    p_limit:    limit,
    p_offset:   offset,
  })

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  return new Response(JSON.stringify({ success: true, data: data ?? [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
})
