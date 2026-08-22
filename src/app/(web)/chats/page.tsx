'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/web/api'
import { useSession } from '@/lib/web/session'
import { Avatar, Card, Empty, ErrorNote, PageTitle, ListSkeleton, date } from '@/components/web/ui'

/** Shape the API returns — it flattens the other party into recipient_*. */
interface ChatRow {
  chat_id: string
  recipient_id?: string | null
  recipient_name?: string | null
  recipient_avatar?: string | null
  last_message?: string | null
  last_message_at?: string | null
  unread_count?: number | null
}

export default function ChatListPage() {
  const { profile } = useSession()
  const [chats, setChats] = useState<ChatRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      // This route is not auth-guarded and takes the user id explicitly.
      const res = await api.get<ChatRow[]>(
        `/chat/list${api.qs({ user_id: profile?.user_id, limit: 50 })}`,
      )
      if (cancelled) return
      if (res.success) setChats(Array.isArray(res.data) ? res.data : [])
      else setError(res.error ?? 'Could not load your chats')
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [profile?.user_id])

  return (
    <div className="space-y-5">
      <PageTitle title="Chats" />
      {error && <ErrorNote>{error}</ErrorNote>}

      <Card bleed>
        {loading ? <ListSkeleton /> : chats.length === 0 ? (
          <Empty title="No conversations yet"
            sub="Message a provider from their profile to get started." />
        ) : (
          <ul className="divide-y divide-line-soft">
            {chats.map((c) => (
              <li key={c.chat_id}>
                <Link href={`/chats/${c.chat_id}`}
                  className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-accent-soft sm:px-5">
                  <Avatar src={c.recipient_avatar} name={c.recipient_name} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate font-semibold text-ink">
                        {c.recipient_name ?? 'Conversation'}
                      </span>
                      {c.last_message_at && (
                        <span className="shrink-0 text-xs text-ink-50">{date(c.last_message_at)}</span>
                      )}
                    </span>
                    <span className="mt-0.5 flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm text-ink-70">
                        {c.last_message ?? 'No messages yet'}
                      </span>
                      {!!c.unread_count && c.unread_count > 0 && (
                        <span className="shrink-0 rounded-full bg-accent-role px-2 py-0.5 text-xs font-bold text-accent-on">
                          {c.unread_count}
                        </span>
                      )}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
