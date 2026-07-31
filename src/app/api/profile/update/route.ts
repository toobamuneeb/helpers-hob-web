import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { validateRequest } from '@/lib/validation'
import { rateLimitMiddleware } from '@/lib/rate-limiter'
import logger from '@/lib/logger'
import { z } from 'zod'

const updateProfileSchema = z.object({
  name:              z.string().min(2).max(50),
  phone:             z.string().min(5).max(20),
  country:           z.string().min(2).max(100),
  state:             z.string().min(2).max(100),
  zip:               z.string().min(2).max(20),
  profile_image_url: z.string().url().optional().nullable(),
  // Location fields for service providers
  location_address:  z.string().optional().nullable(),
  location_lat:      z.number().optional().nullable(),
  location_lng:      z.number().optional().nullable(),
  city:              z.string().optional().nullable(),
})

export const POST = requireAuth(async (request: NextRequest, user) => {
  const rateLimitResult = await rateLimitMiddleware('general')(request)
  if (rateLimitResult) return rateLimitResult

  try {
    const body = await request.json()

    const validation = validateRequest(updateProfileSchema, body)
    if (!validation.success) {
      return new Response(
        JSON.stringify({ error: validation.error }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const { name, phone, country, state, zip, profile_image_url, location_address, location_lat, location_lng, city } = validation.data

    const { data: result, error } = await supabaseAdmin.rpc('update_profile', {
      p_user_id:           user.id,
      p_name:              name,
      p_phone:             phone,
      p_country:           country,
      p_state:             state,
      p_zip:               zip,
      p_profile_image_url: profile_image_url ?? null,
      p_location_address:  location_address ?? null,
      p_location_lat:      location_lat ?? null,
      p_location_lng:      location_lng ?? null,
      p_city:              city ?? null,
    })

    if (error) {
      logger.error('Failed to update profile', { error, userId: user.id })
      return new Response(
        JSON.stringify({ error: 'Failed to update profile' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    logger.info('Profile updated successfully', { userId: user.id })

    return new Response(
      JSON.stringify({ success: true, data: result }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    logger.error('Error in update-profile endpoint', { error, userId: user.id })
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
