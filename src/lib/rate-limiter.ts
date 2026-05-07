import { RateLimiterMemory } from 'rate-limiter-flexible'
import { NextRequest } from 'next/server'

// Rate limiters for different endpoints
const rateLimiters = {
  general: new RateLimiterMemory({
    points: 100, // Number of requests
    duration: 60, // Per 60 seconds
  }),
  
  jobCreation: new RateLimiterMemory({
    points: 10, // Number of requests
    duration: 3600, // Per hour
  }),
  
  messaging: new RateLimiterMemory({
    points: 60, // Number of requests
    duration: 60, // Per 60 seconds
  }),
}

// Helper function to get client IP
function getClientIP(request: NextRequest): string {
  // Try to get IP from various headers
  const forwarded = request.headers.get('x-forwarded-for')
  const realIP = request.headers.get('x-real-ip')
  const cfConnectingIP = request.headers.get('cf-connecting-ip')
  const xClientIP = request.headers.get('x-client-ip')
  
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }
  
  if (realIP) {
    return realIP
  }
  
  if (cfConnectingIP) {
    return cfConnectingIP
  }
  
  if (xClientIP) {
    return xClientIP
  }
  
  // Fallback to a combination of headers for uniqueness
  const userAgent = request.headers.get('user-agent') || ''
  const host = request.headers.get('host') || ''
  
  return `anonymous-${Buffer.from(userAgent + host).toString('base64').slice(0, 10)}`
}

export async function checkRateLimit(
  request: NextRequest, 
  limiterType: keyof typeof rateLimiters = 'general'
): Promise<{ allowed: boolean; error?: string }> {
  try {
    const limiter = rateLimiters[limiterType]
    const key = getClientIP(request)
    await limiter.consume(key)
    return { allowed: true }
  } catch (rejRes: any) {
    const secs = Math.round(rejRes.msBeforeNext / 1000) || 1
    return { 
      allowed: false, 
      error: `Rate limit exceeded. Try again in ${secs} seconds.` 
    }
  }
}

export function rateLimitMiddleware(limiterType: keyof typeof rateLimiters = 'general') {
  return async (request: NextRequest) => {
    const { allowed, error } = await checkRateLimit(request, limiterType)
    
    if (!allowed) {
      return new Response(
        JSON.stringify({ error }),
        { 
          status: 429,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }
    
    return null
  }
}