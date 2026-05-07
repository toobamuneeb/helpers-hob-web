// GET: List chats for a user
import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { rateLimitMiddleware } from '@/lib/rate-limiter'

export const GET = async (request: NextRequest) => {
  const rl = await rateLimitMiddleware('general')(request)
  if (rl) return rl
  const { searchParams } = new URL(request.url)
  const userId = searchParams.get('user_id')
  const limit = parseInt(searchParams.get('limit') || '20')
  const offset = parseInt(searchParams.get('offset') || '0')
  if (!userId) return new Response(JSON.stringify({ error: 'user_id required' }), { status: 400, headers: { 'Content-Type': 'application/json' } })

  const { data: chats, error } = await supabaseAdmin
    .from('chats')
    .select(`
      chat_id, customer_id, service_provider_id,
      last_message_preview, last_message_at, created_at,
      customer:profiles!chats_customer_id_fkey(user_id, name, profile_image_url),
      provider:profiles!chats_service_provider_id_fkey(user_id, name, profile_image_url)
    `)
    .or(`customer_id.eq.${userId},service_provider_id.eq.${userId}`)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) return new Response(JSON.stringify({ error: 'Failed to fetch chats' }), { status: 500, headers: { 'Content-Type': 'application/json' } })

  const transformed = (chats || []).map((chat: any) => {
    const isCustomer = chat.customer_id === userId
    const recipient = isCustomer ? chat.provider : chat.customer
    return {
      chat_id: chat.chat_id,
      recipient_id: recipient?.user_id,
      recipient_name: recipient?.name,
      recipient_avatar: recipient?.profile_image_url,
      last_message: chat.last_message_preview || 'No messages yet',
      last_message_at: chat.last_message_at || chat.created_at,
      unread_count: 0,
    }
  })

  return new Response(JSON.stringify({ success: true, data: transformed, pagination: { limit, offset, has_more: chats && chats.length === limit } }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}
