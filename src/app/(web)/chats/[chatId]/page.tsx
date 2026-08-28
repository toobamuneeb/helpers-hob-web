'use client'

import { use, useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/lib/web/api'
import { getBrowserSupabase } from '@/lib/supabase-browser'
import { useSession } from '@/lib/web/session'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Avatar, BackLink, Button, ErrorNote, INPUT_CLASS, Spinner, dateTime } from '@/components/web/ui'

interface ChatMeta {
  recipient_id?: string | null
  recipient_name?: string | null
  recipient_avatar?: string | null
}

interface Message {
  message_id: string
  chat_id: string
  sender_id: string
  content: string
  message_type?: string | null
  created_at: string
}

export default function ChatPage({ params }: { params: Promise<{ chatId: string }> }) {
  const { chatId } = use(params)
  const { profile, isCustomer, isProvider } = useSession()
  const router = useRouter()
  const [meta, setMeta] = useState<ChatMeta | null>(null)

  const [messages, setMessages] = useState<Message[]>([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    const res = await api.get<Message[]>(`/chat/messages/${chatId}?limit=100`)
    if (res.success) {
      const list = Array.isArray(res.data) ? res.data : []
      // The API returns newest-first for the inverted mobile list; the web
      // reads top-to-bottom, so oldest goes first.
      setMessages([...list].reverse())
      setError(null)
    } else {
      setError(res.error ?? 'Could not load this conversation')
    }
    setLoading(false)
  }, [chatId])

  // Who this conversation is with. /chat/list already flattens it to
  // recipient_*, so no extra endpoint is needed.
  useEffect(() => {
    if (!profile) return
    let cancelled = false
    void (async () => {
      const res = await api.get<ChatMeta[]>(
        `/chat/list${api.qs({ user_id: profile.user_id, limit: 100 })}`,
      )
      if (cancelled || !res.success || !Array.isArray(res.data)) return
      const row = (res.data as (ChatMeta & { chat_id?: string })[]).find(
        (c) => c.chat_id === chatId,
      )
      if (row) setMeta(row)
    })()
    return () => { cancelled = true }
  }, [chatId, profile])

  useEffect(() => {
    let cancelled = false
    // Deferred so the first fetch's setState lands outside the effect body.
    const first = setTimeout(() => {
      if (cancelled) return
      void load()
      void api.post('/chat/mark-read', { chat_id: chatId })
    }, 0)
    // Realtime on this chat's messages, the same subscription the mobile
    // useChat opens. The slow interval stays underneath as a safety net for a
    // dropped socket — long enough not to be the thing doing the work.
    const supabase = getBrowserSupabase()
    const channel = supabase
      .channel(`chat-messages-${chatId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages',
          filter: `chat_id=eq.${chatId}` },
        () => {
          if (cancelled) return
          void load()
          void api.post('/chat/mark-read', { chat_id: chatId })
        })
      .subscribe()

    const timer = setInterval(() => { if (!cancelled) void load() }, 30000)
    return () => {
      cancelled = true
      clearTimeout(first)
      clearInterval(timer)
      void supabase.removeChannel(channel)
    }
  }, [chatId, load])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  async function send(e: React.FormEvent) {
    e.preventDefault()
    const content = text.trim()
    if (!content || !profile) return

    setSending(true)
    const res = await api.post('/chat/send-message', {
      chat_id: chatId,
      sender_id: profile.user_id,
      content,
      message_type: 'text',
    })
    if (res.success) { setText(''); await load() }
    else setError(res.error ?? 'Message not sent')
    setSending(false)
  }

  return (
    // dvh, not vh: mobile browsers shrink the viewport as the URL bar hides,
    // and vh would leave the composer under the tab bar. Offsets differ by
    // breakpoint because the mobile header and bottom tabs only exist below lg.
    <div className="flex h-[calc(100dvh-14rem)] min-h-[24rem] flex-col lg:h-[calc(100dvh-11rem)]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <BackLink href="/chats">Back to chats</BackLink>

        {/* Mobile shows "Hire now" in the chat header for customers only, and
            carries the provider into the offer form. Same here. */}
        {isCustomer && meta?.recipient_id && (
          <Button
            size="sm"
            onClick={() =>
              router.push(
                `/post-job${api.qs({ provider: meta.recipient_id, chat: chatId })}`,
              )
            }
          >
            Hire now
          </Button>
        )}
      </div>

      {meta?.recipient_name && (
        <div className="mb-3 flex items-center gap-2.5 rounded-xl border border-line bg-surface px-4 py-3">
          <Avatar src={meta.recipient_avatar} name={meta.recipient_name} size="sm" />
          {/* Whoever you are talking to, their profile is one tap away. */}
          {meta.recipient_id ? (
            <Link
              href={isProvider ? `/customers/${meta.recipient_id}` : `/providers/${meta.recipient_id}`}
              className="font-semibold text-ink hover:text-accent-role hover:underline"
            >
              {meta.recipient_name}
            </Link>
          ) : (
            <span className="font-semibold text-ink">{meta.recipient_name}</span>
          )}
        </div>
      )}

      {error && <div className="mb-3"><ErrorNote>{error}</ErrorNote></div>}

      <div className="flex-1 overflow-y-auto rounded-xl border border-line bg-surface p-4">
        {loading ? <Spinner /> : messages.length === 0 ? (
          <p className="py-16 text-center text-sm text-ink-50">
            No messages yet. Start the conversation!
          </p>
        ) : (
          <ul className="space-y-3">
            {messages.map((m) => {
              const mine = m.sender_id === profile?.user_id
              return (
                <li key={m.message_id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <span className={`max-w-[75%] rounded-xl px-3.5 py-2.5 ${
                    mine ? 'bg-accent-role text-accent-on' : 'bg-surface-muted text-ink'}`}>
                    <span className="block whitespace-pre-wrap text-sm">{m.content}</span>
                    <span className={`mt-1 block text-[0.65rem] ${mine ? 'opacity-75' : 'text-ink-50'}`}>
                      {dateTime(m.created_at)}
                    </span>
                  </span>
                </li>
              )
            })}
          </ul>
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={send} className="mt-3 flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)}
          placeholder="Type a message" maxLength={2000} className={INPUT_CLASS} />
        <Button type="submit" loading={sending} disabled={!text.trim()}>Send</Button>
      </form>
    </div>
  )
}
