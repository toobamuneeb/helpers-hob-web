// GET /api/jobs/posts/[jobId] - Get job post details by ID
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { rateLimitMiddleware } from '@/lib/rate-limiter'
import logger from '@/lib/logger'

export const GET = requireAuth(async (
  request: NextRequest,
  user,
  context?: { params?: Promise<{ jobId: string }> }
) => {
  const rl = await rateLimitMiddleware('general')(request)
  if (rl) return rl

  const { jobId } = await (context?.params ?? Promise.resolve({ jobId: '' }))
  if (!jobId) {
    return new Response(JSON.stringify({ error: 'Job ID required' }), { 
      status: 400, 
      headers: { 'Content-Type': 'application/json' } 
    })
  }

  try {
    // Fetch job post with skill info
    const { data, error } = await supabaseAdmin
      .from('jobs')
      .select(`
        *,
        skill:skills(id, name, icon, color),
        customer:profiles!jobs_customer_id_fkey(user_id, name, profile_image_url)
      `)
      .eq('job_id', jobId)
      .single()

    if (error) {
      logger.error('Failed to fetch job post', { error, jobId, userId: user.id })
      return new Response(JSON.stringify({ error: error.message }), { 
        status: 500, 
        headers: { 'Content-Type': 'application/json' } 
      })
    }

    if (!data) {
      return new Response(JSON.stringify({ error: 'Job post not found' }), { 
        status: 404, 
        headers: { 'Content-Type': 'application/json' } 
      })
    }

    // Format response
    const formatted = {
      ...data,
      skill_name: data.skill?.name,
      skill_color: data.skill?.color,
      skill_icon: data.skill?.icon,
      customer_id: data.customer?.user_id,
      customer_name: data.customer?.name,
      customer_avatar: data.customer?.profile_image_url,
    }

    logger.info('Job post fetched', { jobId, userId: user.id })
    return new Response(JSON.stringify({ success: true, data: formatted }), { 
      status: 200, 
      headers: { 'Content-Type': 'application/json' } 
    })
  } catch (err: any) {
    logger.error('Job post fetch error', { error: err.message, jobId, userId: user.id })
    return new Response(JSON.stringify({ error: 'Internal server error' }), { 
      status: 500, 
      headers: { 'Content-Type': 'application/json' } 
    })
  }
})
