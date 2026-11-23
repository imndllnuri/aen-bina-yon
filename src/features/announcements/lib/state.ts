export type AnnouncementType = 'genel' | 'acil' | 'bakim' | 'toplanti'

export const TYPE_LABEL: Record<AnnouncementType, string> = { genel: 'Genel', acil: 'Acil', bakim: 'Bakım', toplanti: 'Toplantı' }
export const TYPES = Object.keys(TYPE_LABEL) as AnnouncementType[]
export const TYPE_VARIANT: Record<AnnouncementType, 'secondary' | 'destructive' | 'outline' | 'default'> = { genel: 'secondary', acil: 'destructive', bakim: 'outline', toplanti: 'default' }
export const typeLabel = (type: string) => (type in TYPE_LABEL ? TYPE_LABEL[type as AnnouncementType] : 'Genel')
export const typeVariant = (type: string) => (type in TYPE_VARIANT ? TYPE_VARIANT[type as AnnouncementType] : 'secondary')

export type AnnouncementState = 'draft' | 'scheduled' | 'live' | 'expired'
export const STATE_LABEL: Record<AnnouncementState, string> = { draft: 'Taslak', scheduled: 'Planlandı', live: 'Yayında', expired: 'Süresi doldu' }

/** What the admin reads in the list: a draft, scheduled for later, live now, or past its end time. */
export function announcementState(a: { status: string; publishAt: string | null; expireAt: string | null }, now: Date): AnnouncementState {
  if (a.status !== 'published') return 'draft'
  if (a.publishAt && new Date(a.publishAt) > now) return 'scheduled'
  if (a.expireAt && new Date(a.expireAt) <= now) return 'expired'
  return 'live'
}

/** In the resident's archive: its end time has passed. */
export const isArchived = (a: { expireAt: string | null }, now: Date) => a.expireAt !== null && new Date(a.expireAt) <= now
