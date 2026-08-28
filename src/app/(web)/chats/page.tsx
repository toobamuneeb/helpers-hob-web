'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/web/api'
import { useSession } from '@/lib/web/session'
import { getBrowserSupabase } from '@/lib/supabase-browser'
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

  const userId = profile?.user_id

  const load = useCallback(async () => {
    if (!userId) return
    // This route is not auth-guarded and takes the user id explicitly.
    const res = await api.get<ChatRow[]>(
      `/chat/list${api.qs({ user_id: userId, limit: 50 })}`,
    )
    if (res.success) setChats(Array.isArray(res.data) ? res.data : [])
    else setError(res.error ?? 'Could not load your chats')
    setLoading(false)
  }, [userId])

  useEffect(() => {
    let cancelled = false
    void (async () => { if (!cancelled) await load() })()
    return () => { cancelled = true }
  }, [load])

  /**
   * Live updates, the way the mobile chat list has them.
   *
   * Mobile watches three things: the chats row for either side of the
   * conversation, and its own chat_participants row for the unread count. The
   * list is small and the endpoint does the ordering and unread maths, so a
   * change of any kind just reloads it rather than trying to merge by hand.
   */
  useEffect(() => {
    if (!userId) return
    const supabase = getBrowserSupabase()

    const channel = supabase
      .channel(`chat-list-${userId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'chats' },
        () => { void load() })
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        () => { void load() })
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'chat_participants',
          filter: `user_id=eq.${userId}` },
        () => { void load() })
      .subscribe()

    return () => { void supabase.removeChannel(channel) }
  }, [userId, load])

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
