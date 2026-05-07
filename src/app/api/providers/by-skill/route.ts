// GET: Providers filtered by skill
// ?skill_id=...&skill_name=...&limit=...&offset=...
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { rateLimitMiddleware } from '@/lib/rate-limiter'

export const GET = requireAuth(async (request: NextRequest) => {
  const rl = await rateLimitMiddleware('general')(request)
  if (rl) return rl

  const url       = new URL(request.url)
  const skillId   = url.searchParams.get('skill_id') ?? null
  const skillName = url.searchParams.get('skill_name') ?? null
  const limit     = parseInt(url.searchParams.get('limit') ?? '20')
  const offset    = parseInt(url.searchParams.get('offset') ?? '0')

  const { data, error } = await supabaseAdmin.rpc('get_providers_by_skill', {
    p_skill_id:   skillId,
    p_skill_name: skillName,
    p_limit:      limit,
    p_offset:     offset,
  })
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })

  return new Response(JSON.stringify({ success: true, data: data ?? [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
})
