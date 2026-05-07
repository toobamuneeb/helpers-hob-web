import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { validateRequest, sendMessageSchema } from '@/lib/validation'
import { rateLimitMiddleware } from '@/lib/rate-limiter'

export const POST = requireAuth(async (request: NextRequest, user) => {
  const rl = await rateLimitMiddleware('messaging')(request)
  if (rl) return rl

  const v = validateRequest(sendMessageSchema, await request.json())
  if (!v.success) return new Response(JSON.stringify({ error: v.error }), { status: 400, headers: { 'Content-Type': 'application/json' } })

  const { chat_id, content, message_type, action_type, action_data, sender_id } = v.data

  const { data, error } = await supabaseAdmin.rpc('send_message_with_action', {
    p_chat_id:      chat_id,
    p_sender_id:    sender_id ?? user.id,
    p_content:      content,
    p_message_type: message_type,
    p_action_type:  action_type,
    p_action_data:  action_data,
  })

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  return new Response(JSON.stringify({ success: true, data }), { status: 201, headers: { 'Content-Type': 'application/json' } })
})
