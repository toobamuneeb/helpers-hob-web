// GET: Open job posts for provider (home screen feed, skill matched)
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
  const skill_filter = searchParams.get('skill_filter') || null
  const { data, error } = await supabaseAdmin.rpc('get_open_job_posts_for_provider', {
    p_provider_id: user.id, p_limit: limit, p_offset: offset, p_skill_filter: skill_filter
  })
  if (error) {
    console.error('Job feed error:', error)
    return new Response(JSON.stringify({ error: 'Failed to fetch feed', details: error.message, code: error.code }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
  return new Response(JSON.stringify({ success: true, data: data || [], pagination: { limit, offset, has_more: data && data.length === limit } }), { status: 200, headers: { 'Content-Type': 'application/json' } })
})
