import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { rateLimitMiddleware } from '@/lib/rate-limiter'

export const GET = requireAuth(async (request: NextRequest, user, context?: { params?: Promise<{ chatId: string }> }) => {
  const rl = await rateLimitMiddleware('general')(request)
  if (rl) return rl

  const { chatId } = await (context?.params ?? Promise.resolve({ chatId: '' }))
  if (!chatId) return new Response(JSON.stringify({ error: 'Chat ID required' }), { status: 400, headers: { 'Content-Type': 'application/json' } })

  const { searchParams } = new URL(request.url)
  const limit  = parseInt(searchParams.get('limit')  || '50')
  const offset = parseInt(searchParams.get('offset') || '0')

  const { data, error } = await supabaseAdmin.rpc('get_chat_messages', {
    p_chat_id: chatId,
    p_limit:   limit,
    p_offset:  offset,
  })

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  return new Response(JSON.stringify({ success: true, data: data || [], pagination: { limit, offset, has_more: data && data.length === limit } }), { status: 200, headers: { 'Content-Type': 'application/json' } })
})
