// GET: All provider offers for calendar view (no recurring filter — shows all occurrences)
import { NextRequest } from 'next/server'
import { requireRole } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { rateLimitMiddleware } from '@/lib/rate-limiter'

export const GET = requireRole('service_provider')(async (request: NextRequest, user) => {
  const rl = await rateLimitMiddleware('general')(request)
  if (rl) return rl

  const url = new URL(request.url)
  const startDate = url.searchParams.get('start_date') ?? null
  const endDate   = url.searchParams.get('end_date')   ?? null
  const limit     = parseInt(url.searchParams.get('limit')  ?? '200')
  const offset    = parseInt(url.searchParams.get('offset') ?? '0')

  const { data, error } = await supabaseAdmin.rpc('get_provider_calendar_offers', {
    p_provider_id: user.id,
    p_start_date:  startDate,
    p_end_date:    endDate,
    p_limit:       limit,
    p_offset:      offset,
  })

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  return new Response(JSON.stringify({ success: true, data: data ?? [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
})
