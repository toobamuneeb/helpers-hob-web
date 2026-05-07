import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'
import logger from '@/lib/logger'

export const GET = async (request: NextRequest) => {
  try {
    // Test database connection
    const { data, error } = await supabase
      .from('profiles')
      .select('count')
      .limit(1)

    if (error) {
      logger.error('Health check failed - database error', { error })
      return new Response(
        JSON.stringify({ 
          success: false, 
          status: 'unhealthy',
          error: 'Database connection failed',
          timestamp: new Date().toISOString()
        }),
        { 
          status: 503, 
          headers: { 'Content-Type': 'application/json' } 
        }
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        status: 'healthy',
        message: 'HelpersHob Backend API is running',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development'
      }),
      { 
        status: 200, 
        headers: { 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    logger.error('Health check failed - unexpected error', { error })
    return new Response(
      JSON.stringify({ 
        success: false, 
        status: 'unhealthy',
        error: 'Internal server error',
        timestamp: new Date().toISOString()
      }),
      { 
        status: 500, 
        headers: { 'Content-Type': 'application/json' } 
      }
    )
  }
}