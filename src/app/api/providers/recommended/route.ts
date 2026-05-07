import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'
import { rateLimitMiddleware } from '@/lib/rate-limiter'
import logger from '@/lib/logger'

export const GET = async (request: NextRequest) => {
  const rateLimitResult = await rateLimitMiddleware('general')(request)
  if (rateLimitResult) return rateLimitResult

  try {
    const { searchParams } = new URL(request.url)
    
    const limit = parseInt(searchParams.get('limit') || '10')
    const offset = parseInt(searchParams.get('offset') || '0')

    // Fetch recommended service providers using RPC function
    const { data: providers, error } = await supabase
      .rpc('get_recommended_providers', {
        p_limit: limit,
        p_offset: offset
      })

    if (error) {
      logger.error('Failed to fetch recommended providers', { error })
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Failed to fetch recommended providers' 
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    logger.debug('Recommended providers fetched successfully', { 
      resultCount: providers?.length || 0,
      limit,
      offset
    })

    return new Response(
      JSON.stringify({
        success: true,
        data: providers || [],
        pagination: {
          limit,
          offset,
          has_more: providers && providers.length === limit
        }
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    logger.error('Error in recommended-providers endpoint', { error })
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Internal server error' 
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
