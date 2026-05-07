import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { validateRequest } from '@/lib/validation'
import { rateLimitMiddleware } from '@/lib/rate-limiter'
import { z } from 'zod'

const markReadSchema = z.object({
  chat_id: z.string().uuid(),
  user_id: z.string().uuid(),
})

export const POST = requireAuth(async (request: NextRequest) => {
  const rl = await rateLimitMiddleware('general')(request)
  if (rl) return rl

  const body = await request.json()
  const v = validateRequest(markReadSchema, body)
  if (!v.success) return new Response(JSON.stringify({ error: v.error }), { status: 400, headers: { 'Content-Type': 'application/json' } })

  const { chat_id, user_id } = v.data
  const { data, error } = await supabaseAdmin.rpc('mark_messages_as_read', {
    p_chat_id: chat_id,
    p_user_id: user_id,
  })

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  return new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { 'Content-Type': 'application/json' } })
})