import { supabase } from '@/lib/supabase'
import type { Target } from './lib/schemas'
import type { AnnouncementType } from './lib/state'

// Announcements (Duyurular). A resident reads only what was sent to THEM (Row Level Security); an admin works through
// checked functions (nothing is written to the tables directly). The target is never readable by residents.

function client() {
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}
const nullable = <T extends string | null>(value: T) => value as string

const toType = (value: string): AnnouncementType => (value === 'acil' || value === 'bakim' || value === 'toplanti' ? value : 'genel')

// ---------------------------------------------------------------------------
// Resident
// ---------------------------------------------------------------------------
export interface MyAnnouncement {
  id: string
  title: string
  body: string
  type: AnnouncementType
  pinned: boolean
  publishAt: string | null
  expireAt: string | null
  publishedAt: string
}

/** Pinned first, then the newest. (Row Level Security: published, started, and sent to this person.) */
export async function fetchMyAnnouncements(): Promise<MyAnnouncement[]> {
  const { data, error } = await client()
    .from('announcements')
    .select('id, title, body, type, pinned, publish_at, expire_at, published_at')
    .order('pinned', { ascending: false })
    .order('published_at', { ascending: false })
    .order('id')
    .limit(200)
  if (error) throw error
  return data.map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    type: toType(row.type),
    pinned: row.pinned,
    publishAt: row.publish_at,
    expireAt: row.expire_at,
    publishedAt: row.published_at ?? '',
  }))
}

export async function fetchMyReadIds(): Promise<string[]> {
  const { data, error } = await client().from('announcement_reads').select('announcement_id')
  if (error) throw error
  return data.map((row) => row.announcement_id)
}

export async function markAnnouncementRead(id: string): Promise<void> {
  const { error } = await client().rpc('mark_announcement_read', { p_announcement: id })
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------
export interface AdminAnnouncement {
  id: string
  title: string
  body: string
  type: AnnouncementType
  pinned: boolean
  status: 'draft' | 'published'
  publishAt: string | null
  expireAt: string | null
  publishedAt: string | null
  recipientCount: number
  readCount: number
  resendCount: number
  lastResentAt: string | null
  createdAt: string
  updatedAt: string
}

export async function listAnnouncements(siteId: string): Promise<AdminAnnouncement[]> {
  const { data, error } = await client().rpc('list_announcements', { p_site: siteId })
  if (error) throw error
  return data.map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    type: toType(row.type),
    pinned: row.pinned,
    status: row.status === 'published' ? 'published' : 'draft',
    publishAt: row.publish_at,
    expireAt: row.expire_at,
    publishedAt: row.published_at,
    recipientCount: row.recipient_count,
    readCount: row.read_count,
    resendCount: row.resend_count,
    lastResentAt: row.last_resent_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))
}

export interface SaveAnnouncementInput {
  /** null = a new draft */
  id: string | null
  siteId: string
  title: string
  body: string
  type: AnnouncementType
  pinned: boolean
  target: Target
  /** ISO timestamps (Istanbul time) or null */
  publishAt: string | null
  expireAt: string | null
}

export async function saveAnnouncement(input: SaveAnnouncementInput): Promise<string> {
  const { data, error } = await client().rpc('save_announcement', {
    p_id: nullable(input.id),
    p_site: input.siteId,
    p_title: input.title,
    p_body: input.body,
    p_type: input.type,
    p_pinned: input.pinned,
    p_target: { ...input.target },
    p_publish_at: nullable(input.publishAt),
    p_expire_at: nullable(input.expireAt),
  })
  if (error) throw error
  return data
}

export async function publishAnnouncement(id: string): Promise<number> {
  const { data, error } = await client().rpc('publish_announcement', { p_id: id })
  if (error) throw error
  return data
}

export async function unpublishAnnouncement(id: string): Promise<void> {
  const { error } = await client().rpc('unpublish_announcement', { p_id: id })
  if (error) throw error
}

export async function deleteAnnouncement(id: string): Promise<void> {
  const { error } = await client().rpc('delete_announcement', { p_id: id })
  if (error) throw error
}

export async function resendAnnouncementUnread(id: string): Promise<number> {
  const { data, error } = await client().rpc('resend_announcement_unread', { p_id: id })
  if (error) throw error
  return data
}

export async function fetchAnnouncementTarget(id: string): Promise<Target> {
  const { data, error } = await client().rpc('announcement_target', { p_id: id })
  if (error) throw error
  return data as unknown as Target
}

export interface AudiencePreview {
  recipients: number
  units: number
}

export async function previewAudience(siteId: string, target: Target): Promise<AudiencePreview> {
  const { data, error } = await client().rpc('preview_announcement_audience', { p_site: siteId, p_target: { ...target } })
  if (error) throw error
  return { recipients: data[0]?.recipients ?? 0, units: data[0]?.units ?? 0 }
}

export interface ReportRow {
  profileId: string
  fullName: string | null
  units: string
  relations: string
  readAt: string | null
}

export async function fetchAnnouncementReport(id: string): Promise<ReportRow[]> {
  const { data, error } = await client().rpc('announcement_report', { p_id: id })
  if (error) throw error
  return data.map((row) => ({ profileId: row.profile_id, fullName: row.full_name, units: row.units, relations: row.relations, readAt: row.read_at }))
}
