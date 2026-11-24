import { supabase } from '@/lib/supabase'

// The quote requests that visitors send from the public "Teklif Al" form. Only admins read them. An admin can change the
// status and write a note; the text the visitor wrote cannot be changed (column grants), and a request can be deleted.

function client() {
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}

export const QUOTE_STATUS = [
  { code: 'new', label: 'Yeni' },
  { code: 'contacted', label: 'Arandı' },
  { code: 'offered', label: 'Teklif verildi' },
  { code: 'won', label: 'Kazanıldı' },
  { code: 'lost', label: 'Kaybedildi' },
  { code: 'closed', label: 'Kapandı' },
] as const
export type QuoteStatus = (typeof QUOTE_STATUS)[number]['code']
export const quoteStatusLabel = (code: string) => QUOTE_STATUS.find((s) => s.code === code)?.label ?? code

export interface QuoteRow {
  id: string
  name: string
  phone: string | null
  email: string | null
  buildingType: string | null
  unitCount: number | null
  il: string | null
  ilce: string | null
  message: string | null
  status: string
  adminNote: string | null
  createdAt: string
}

export async function fetchQuotes(): Promise<QuoteRow[]> {
  const { data, error } = await client()
    .from('quote_requests')
    .select('id, name, phone, email, building_type, unit_count, il, ilce, message, status, admin_note, created_at')
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) throw error
  return data.map((row) => ({
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    buildingType: row.building_type,
    unitCount: row.unit_count,
    il: row.il,
    ilce: row.ilce,
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

export const updateQuoteStatus = (id: string, status: string) => changed(client().from('quote_requests').update({ status }).eq('id', id).select('id'))
export const updateQuoteNote = (id: string, note: string) => changed(client().from('quote_requests').update({ admin_note: note.trim() === '' ? null : note.trim() }).eq('id', id).select('id'))
export const deleteQuote = (id: string) => changed(client().from('quote_requests').delete().eq('id', id).select('id'))
