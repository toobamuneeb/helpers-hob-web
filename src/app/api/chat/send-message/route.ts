import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { validateRequest, sendMessageSchema } from '@/lib/validation'
import { rateLimitMiddleware } from '@/lib/rate-limiter'
import { contactAllowed, detectContact } from '@/lib/chat-guard'
import logger from '@/lib/logger'

export const POST = requireAuth(async (request: NextRequest, user) => {
  const rl = await rateLimitMiddleware('messaging')(request)
  if (rl) return rl

  const v = validateRequest(sendMessageSchema, await request.json())
  if (!v.success) return new Response(JSON.stringify({ error: v.error }), { status: 400, headers: { 'Content-Type': 'application/json' } })

  const { chat_id, content, message_type, action_type, action_data, sender_id } = v.data


  const hit = detectContact(content)
  if (hit) {
    const { data: chat } = await supabaseAdmin
      .from('chats')
      .select('customer_id, service_provider_id')
      .eq('chat_id', chat_id)
      .maybeSingle()

    if (chat) {

      const { data: booking } = await supabaseAdmin
        .from('job_offers')
        .select('offer_status')
        .eq('customer_id', chat.customer_id)
        .eq('provider_id', chat.service_provider_id)
        .in('offer_status', ['scheduled', 'active', 'awaiting_confirmation', 'completed'])
        .limit(1)
        .maybeSingle()

      if (!contactAllowed(booking?.offer_status)) {

        await supabaseAdmin.from('admin_notifications').insert({
          kind: 'contact_blocked',
          title: 'Contact details blocked in chat',
          body: `${hit} · sender ${sender_id ?? user.id}`,
          subject_type: 'chat',
          subject_id: chat_id,
        }).then(
          () => {},
          (err) => logger.error('contact block not recorded', { error: String(err) }),
        )

        logger.info('contact details blocked', { chatId: chat_id, kind: hit })
        return new Response(
          JSON.stringify({ error: 'CONTACT_BLOCKED', code: 'CONTACT_BLOCKED' }),
          { status: 422, headers: { 'Content-Type': 'application/json' } },
        )
      }
    }
  }

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
