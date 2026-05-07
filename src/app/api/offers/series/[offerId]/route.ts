// GET: Recurring offer series
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { rateLimitMiddleware } from '@/lib/rate-limiter'

export const GET = requireAuth(async (
  request: NextRequest,
  user,
  context?: { params?: Promise<{ offerId: string }> }
) => {
  const rl = await rateLimitMiddleware('general')(request)
  if (rl) return rl
  const { offerId } = await (context?.params ?? Promise.resolve({ offerId: '' }))
  if (!offerId) return new Response(JSON.stringify({ error: 'Offer ID required' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  const { data, error } = await supabaseAdmin.rpc('get_recurring_offer_series', { p_master_offer_id: offerId })
  if (error) return new Response(JSON.stringify({ error: 'Failed to fetch series' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  const jobs = data || []
  const stats = {
    total_occurrences: jobs.length,
    completed_occurrences: jobs.filter((j: any) => j.offer_status === 'completed').length,
    upcoming_occurrences: jobs.filter((j: any) => !['completed','canceled'].includes(j.offer_status)).length,
  }
  return new Response(JSON.stringify({ success: true, data: jobs, stats }), { status: 200, headers: { 'Content-Type': 'application/json' } })
})
