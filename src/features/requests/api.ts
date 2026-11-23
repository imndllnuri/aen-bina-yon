import { supabase } from '@/lib/supabase'
import type { PreparedPhoto } from './lib/photo'
import { DONE_STATUSES, OPEN_STATUSES, type Status } from './lib/catalog'

// Everything the request screens ask Supabase.
// Nothing here decides who may do what: the database does (migration 0008). Requests, comments, photos and the timeline are
// never written directly: every change goes through a checked function. Internal notes are never sent to a resident:
// the row security of request_comments hides them.

function client() {
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}

/** The browser types say a function argument is never null; the database accepts null for these. */
const nullable = <T extends string | string[]>(value: T | null) => value as T

// ---------------------------------------------------------------------------
// Photos (private bucket "talep-fotolari")
// ---------------------------------------------------------------------------
export async function uploadRequestPhoto(path: string, photo: PreparedPhoto): Promise<void> {
  const { error } = await client().storage.from('talep-fotolari').upload(path, photo.blob, { contentType: photo.mime, upsert: false })
  // A retry after a lost answer: the file is already there. That is fine (the name is a fresh random id).
  if (error && !/already exists|duplicate/i.test(error.message)) throw error
}

/** Links that work for 5 minutes, by path. The bucket is private: nobody can open a photo without one. */
export async function requestPhotoUrls(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {}
  const { data, error } = await client().storage.from('talep-fotolari').createSignedUrls(paths, 300)
  if (error) throw error
  const urls: Record<string, string> = {}
  for (const item of data) if (item.path && item.signedUrl) urls[item.path] = item.signedUrl
  return urls
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------
export interface RequestListItem {
  id: string
  unitId: string
  category: string
  title: string
  priority: string
  status: Status
  rating: number | null
  createdAt: string
  updatedAt: string
  resolvedAt: string | null
}

export interface AdminRequestListItem extends RequestListItem {
  unitLabel: string
  requesterId: string | null
  requesterName: string | null
}

export interface RequestEvent {
  id: string
  kind: string
  fromStatus: string | null
  toStatus: string | null
  rating: number | null
  /** The admin's name (admins only; a resident sees "Yönetim"). */
  actorName: string | null
  actorId: string | null
  createdAt: string
}

export interface RequestComment {
  id: string
  authorId: string | null
  /** The author's name (admins only; a resident sees "Yönetim" / "Siz"). */
  authorName: string | null
  byAdmin: boolean
  isInternal: boolean
  body: string
  createdAt: string
}

export interface RequestPhoto {
  id: string
  path: string
  position: number
}

export interface RequestDetail extends RequestListItem {
  siteId: string
  requesterId: string | null
  createdBy: string | null
  description: string
  location: string | null
  ratedAt: string | null
  unitLabel: string
  requesterName: string | null
  requesterPhone: string | null
  photos: RequestPhoto[]
  events: RequestEvent[]
  comments: RequestComment[]
}

const STATUSES = ['acik', 'inceleniyor', 'islemde', 'cozuldu', 'kapandi', 'iptal']
const toStatus = (value: string): Status => (STATUSES.includes(value) ? (value as Status) : 'acik')

const LIST_COLUMNS = 'id, unit_id, category, title, priority, status, rating, created_at, updated_at, resolved_at'

function toListItem(row: {
  id: string
  unit_id: string
  category: string
  title: string
  priority: string
  status: string
  rating: number | null
  created_at: string
  updated_at: string
  resolved_at: string | null
}): RequestListItem {
  return {
    id: row.id,
    unitId: row.unit_id,
    category: row.category,
    title: row.title,
    priority: row.priority,
    status: toStatus(row.status),
    rating: row.rating,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at,
  }
}

/** The requests that belong to this person (newest first). Row security shows nothing else. */
export async function fetchMyRequests(userId: string): Promise<RequestListItem[]> {
  const { data, error } = await client().from('requests').select(LIST_COLUMNS).eq('requester_id', userId).order('created_at', { ascending: false }).limit(200)
  if (error) throw error
  return data.map(toListItem)
}

const ADMIN_LIST_COLUMNS = `${LIST_COLUMNS}, requester_id, units!inner(door_no, blocks!inner(name)), requester:profiles!requests_requester_id_fkey(full_name)`

/**
 * Every request of the site for the admin: the OPEN ones (newest first), and the newest finished ones. The open ones have
 * their own query, so an old open request can never fall out of the list behind 200 newer, finished ones.
 */
export async function fetchSiteRequests(siteId: string): Promise<AdminRequestListItem[]> {
  const [open, done] = await Promise.all([
    client().from('requests').select(ADMIN_LIST_COLUMNS).eq('site_id', siteId).in('status', [...OPEN_STATUSES]).order('created_at', { ascending: false }).limit(500),
    client().from('requests').select(ADMIN_LIST_COLUMNS).eq('site_id', siteId).in('status', [...DONE_STATUSES]).order('created_at', { ascending: false }).limit(200),
  ])
  if (open.error) throw open.error
  if (done.error) throw done.error
  return [...open.data, ...done.data].map((row) => ({
    ...toListItem(row),
    unitLabel: `${row.units.blocks.name} · ${row.units.door_no}`,
    requesterId: row.requester_id,
    requesterName: row.requester?.full_name ?? null,
  }))
}

const DETAIL_COLUMNS =
  'id, site_id, unit_id, requester_id, created_by, category, title, description, priority, location, status, rating, rated_at, resolved_at, created_at, updated_at, units(door_no, blocks(name)), request_photos(id, file_path, position), request_events(id, kind, from_status, to_status, rating, actor_id, created_at), request_comments(id, author_id, by_admin, is_internal, body, created_at)'

const ADMIN_DETAIL_COLUMNS =
  'id, site_id, unit_id, requester_id, created_by, category, title, description, priority, location, status, rating, rated_at, resolved_at, created_at, updated_at, units(door_no, blocks(name)), requester:profiles!requests_requester_id_fkey(full_name, phone), request_photos(id, file_path, position), request_events(id, kind, from_status, to_status, rating, actor_id, created_at, actor:profiles!request_events_actor_id_fkey(full_name)), request_comments(id, author_id, by_admin, is_internal, body, created_at, author:profiles!request_comments_author_id_fkey(full_name))'

/** One request with its photos, timeline and thread. A resident gets no internal note (row security), an admin gets names. */
export async function fetchRequestDetail(id: string, asAdmin: boolean): Promise<RequestDetail | null> {
  const columns = asAdmin ? ADMIN_DETAIL_COLUMNS : DETAIL_COLUMNS
  const { data, error } = await client()
    .from('requests')
    .select(columns)
    .eq('id', id)
    .order('created_at', { referencedTable: 'request_events', ascending: true })
    .order('created_at', { referencedTable: 'request_comments', ascending: true })
    .order('position', { referencedTable: 'request_photos', ascending: true })
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  // The two selects have the same shape except the names; read through one loose type.
  const row = data as unknown as {
    id: string
    site_id: string
    unit_id: string
    requester_id: string | null
    created_by: string | null
    category: string
    title: string
    priority: string
    status: string
    rating: number | null
    created_at: string
    updated_at: string
    resolved_at: string | null
    description: string
    location: string | null
    rated_at: string | null
    units: { door_no: string; blocks: { name: string } } | null
    requester?: { full_name: string | null; phone: string | null } | null
    request_photos: { id: string; file_path: string; position: number }[]
    request_events: { id: string; kind: string; from_status: string | null; to_status: string | null; rating: number | null; actor_id: string | null; created_at: string; actor?: { full_name: string | null } | null }[]
    request_comments: { id: string; author_id: string | null; by_admin: boolean; is_internal: boolean; body: string; created_at: string; author?: { full_name: string | null } | null }[]
  }
  return {
    ...toListItem(row),
    siteId: row.site_id,
    requesterId: row.requester_id,
    createdBy: row.created_by,
    description: row.description,
    location: row.location,
    ratedAt: row.rated_at,
    unitLabel: row.units ? `${row.units.blocks.name} · ${row.units.door_no}` : '—',
    requesterName: row.requester?.full_name ?? null,
    requesterPhone: row.requester?.phone ?? null,
    photos: row.request_photos.map((p) => ({ id: p.id, path: p.file_path, position: p.position })),
    events: row.request_events.map((e) => ({
      id: e.id,
      kind: e.kind,
      fromStatus: e.from_status,
      toStatus: e.to_status,
      rating: e.rating,
      actorId: e.actor_id,
      actorName: e.actor?.full_name ?? null,
      createdAt: e.created_at,
    })),
    comments: row.request_comments.map((c) => ({
      id: c.id,
      authorId: c.author_id,
      authorName: c.author?.full_name ?? null,
      byAdmin: c.by_admin,
      isInternal: c.is_internal,
      body: c.body,
      createdAt: c.created_at,
    })),
  }
}

// ---------------------------------------------------------------------------
// Changes (every one is a checked database function)
// ---------------------------------------------------------------------------
export interface RequestFields {
  category: string
  title: string
  description: string
  priority: string
  location: string | null
}

export interface CreateRequestInput extends RequestFields {
  /** One random id per form visit: a double tap or a retry returns the same request. */
  token: string
  unitId: string
  /** The paths of the photos that are already in the bucket (at most 3). */
  photoPaths: string[]
  /** An admin opens it for a resident (a phone call): the resident's id. A resident leaves it null. */
  requesterId: string | null
}

export async function createRequest(input: CreateRequestInput): Promise<string> {
  const { data, error } = await client().rpc('create_request', {
    p_token: input.token,
    p_unit: input.unitId,
    p_category: input.category,
    p_title: input.title,
    p_description: input.description,
    p_priority: input.priority,
    p_location: nullable(input.location),
    p_photos: input.photoPaths,
    p_requester: nullable(input.requesterId),
  })
  if (error) throw error
  return data
}

export async function updateRequest(id: string, fields: RequestFields): Promise<void> {
  const { error } = await client().rpc('update_request', {
    p_id: id,
    p_category: fields.category,
    p_title: fields.title,
    p_description: fields.description,
    p_priority: fields.priority,
    p_location: nullable(fields.location),
  })
  if (error) throw error
}

export async function cancelRequest(id: string): Promise<void> {
  const { error } = await client().rpc('cancel_request', { p_id: id })
  if (error) throw error
}

export async function setRequestStatus(id: string, status: string): Promise<void> {
  const { error } = await client().rpc('set_request_status', { p_id: id, p_status: status })
  if (error) throw error
}

export async function setRequestTriage(id: string, category: string, priority: string): Promise<void> {
  const { error } = await client().rpc('set_request_triage', { p_id: id, p_category: category, p_priority: priority })
  if (error) throw error
}

/** `internal` = an internal note: only admins read it (the database refuses it from a resident). */
export async function addRequestComment(requestId: string, body: string, internal: boolean): Promise<void> {
  const { error } = await client().rpc('add_request_comment', { p_request: requestId, p_body: body, p_internal: internal })
  if (error) throw error
}

export async function rateRequest(id: string, rating: number): Promise<void> {
  const { error } = await client().rpc('rate_request', { p_id: id, p_rating: rating })
  if (error) throw error
}
