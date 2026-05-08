import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireRole } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import logger from '@/lib/logger'
import { rateLimitMiddleware } from '@/lib/rate-limiter'

const schema = z.object({
  job_id: z.string().uuid(),
})

export const POST = requireRole('service_provider')(async (request: NextRequest, user) => {
  const rl = await rateLimitMiddleware('general')(request)
  if (rl) return rl

  try {
    const body = await request.json()
    const { job_id } = schema.parse(body)

    // Insert into skipped_jobs table
    const { error: skipError } = await supabaseAdmin
      .from('skipped_jobs')
      .insert({
        user_id: user.id,
        job_id: job_id,
      })

    if (skipError) {
      // If already skipped (unique constraint), that's fine
      if (skipError.code === '23505') {
        return new Response(
          JSON.stringify({ success: true, message: 'Job already skipped' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      }
      throw skipError
    }

    logger.info(`Provider ${user.id} skipped job ${job_id}`)

    return new Response(
      JSON.stringify({ success: true, message: 'Job skipped successfully' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error: any) {
    logger.error('Skip job error:', error)
    
    if (error instanceof z.ZodError) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid request data' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Failed to skip job' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
