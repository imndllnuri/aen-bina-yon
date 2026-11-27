import { supabase } from '@/lib/supabase'

// The messages that visitors send from the public contact form (İletişim). Only admins read them. An admin can change the
// status and write a note; the text the visitor wrote cannot be changed (column grants), and a message can be deleted.

function client() {
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}

export const MESSAGE_STATUS = [
  { code: 'new', label: 'Yeni' },
  { code: 'read', label: 'Okundu' },
  { code: 'answered', label: 'Yanıtlandı' },
] as const
export type MessageStatus = (typeof MESSAGE_STATUS)[number]['code']
export const messageStatusLabel = (code: string) => MESSAGE_STATUS.find((s) => s.code === code)?.label ?? code

export interface MessageRow {
  id: string
  name: string
  phone: string | null
  email: string | null
  message: string
  status: string
  adminNote: string | null
  createdAt: string
}

export async function fetchMessages(): Promise<MessageRow[]> {
  const { data, error } = await client()
    .from('contact_messages')
    .select('id, name, phone, email, message, status, admin_note, created_at')
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) throw error
  return data.map((row) => ({
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    message: row.message,
    status: row.status,
    adminNote: row.admin_note,
    createdAt: row.created_at,
  }))
}

/** Row security shows "nothing changed" instead of an error for a person who is no admin: that is turned into an error here. */
async function changed(promise: PromiseLike<{ data: { id: string }[] | null; error: unknown }>): Promise<void> {
  const { data, error } = await promise
  if (error) throw error
  if (!data || data.length === 0) throw Object.assign(new Error('not allowed'), { code: '42501' })
}

export const updateMessageStatus = (id: string, status: string) => changed(client().from('contact_messages').update({ status }).eq('id', id).select('id'))
export const updateMessageNote = (id: string, note: string) => changed(client().from('contact_messages').update({ admin_note: note.trim() === '' ? null : note.trim() }).eq('id', id).select('id'))
export const deleteMessage = (id: string) => changed(client().from('contact_messages').delete().eq('id', id).select('id'))
