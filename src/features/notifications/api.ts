import { supabase } from '@/lib/supabase'

// The bell. Row Level Security shows a person only THEIR OWN notifications that are due; nothing here filters for permission.
// Notifications are written by the database only (triggers and checked functions), never by the browser.

function client() {
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}

export interface NotificationRow {
  id: string
  kind: string
  title: string
  body: string | null
  link: string | null
  createdAt: string
  readAt: string | null
}

export async function fetchNotifications(): Promise<NotificationRow[]> {
  const { data, error } = await client()
    .from('notifications')
    .select('id, kind, title, body, link, created_at, read_at')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(100)
  if (error) throw error
  return data.map((row) => ({ id: row.id, kind: row.kind, title: row.title, body: row.body, link: row.link, createdAt: row.created_at, readAt: row.read_at }))
}

export async function fetchUnreadCount(): Promise<number> {
  const { count, error } = await client().from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null)
  if (error) throw error
  return count ?? 0
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await client().from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id).is('read_at', null)
  if (error) throw error
}

export async function markAllNotificationsRead(): Promise<void> {
  const { error } = await client().from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null)
  if (error) throw error
}

export async function deleteNotification(id: string): Promise<void> {
  const { error } = await client().from('notifications').delete().eq('id', id)
  if (error) throw error
}

export async function deleteAllNotifications(): Promise<void> {
  // PostgREST wants a filter on a delete: "every row of mine" (Row Level Security limits it to the person's own).
  const { error } = await client().from('notifications').delete().not('id', 'is', null)
  if (error) throw error
}
