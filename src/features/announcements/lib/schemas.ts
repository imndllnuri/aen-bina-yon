import { z } from 'zod'
import { istanbulLocalToIso } from './time'

// The compose form. Friendly Turkish messages first; the database repeats every rule, these are never the real guard.

export const SCOPES = ['site', 'blocks', 'units', 'persons'] as const
export const AUDIENCES = ['all', 'owners', 'tenants', 'debtors'] as const
export const SCOPE_LABEL: Record<(typeof SCOPES)[number], string> = { site: 'Tüm site', blocks: 'Seçilen bloklar', units: 'Seçilen daireler', persons: 'Seçilen kişiler' }
export const AUDIENCE_LABEL: Record<(typeof AUDIENCES)[number], string> = { all: 'Herkes', owners: 'Sadece kat malikleri', tenants: 'Sadece kiracılar', debtors: 'Borcu olanlar' }

const optionalTime = (label: string) =>
  z.string().refine((v) => v === '' || istanbulLocalToIso(v) !== null, `${label}: geçerli bir tarih ve saat seçin.`)

export const announcementSchema = z
  .object({
    title: z.string().trim().min(3, 'Başlık en az 3 karakter olmalı.').max(120, 'Başlık en fazla 120 karakter olabilir.'),
    body: z.string().trim().min(1, 'Metni yazın.').max(5000, 'Metin en fazla 5000 karakter olabilir.'),
    type: z.enum(['genel', 'acil', 'bakim', 'toplanti'], { error: 'Duyuru türünü seçin.' }),
    pinned: z.boolean(),
    scope: z.enum(SCOPES),
    audience: z.enum(AUDIENCES),
    blockIds: z.array(z.string()),
    unitIds: z.array(z.string()),
    profileIds: z.array(z.string()),
    publishAt: optionalTime('Başlangıç'),
    expireAt: optionalTime('Bitiş'),
  })
  .superRefine((v, ctx) => {
    if (v.scope === 'blocks' && v.blockIds.length === 0) ctx.addIssue({ code: 'custom', path: ['blockIds'], message: 'En az bir blok seçin.' })
    if (v.scope === 'units' && v.unitIds.length === 0) ctx.addIssue({ code: 'custom', path: ['unitIds'], message: 'En az bir daire seçin.' })
    if (v.scope === 'persons' && v.profileIds.length === 0) ctx.addIssue({ code: 'custom', path: ['profileIds'], message: 'En az bir kişi seçin.' })
    const start = v.publishAt ? istanbulLocalToIso(v.publishAt) : null
    const end = v.expireAt ? istanbulLocalToIso(v.expireAt) : null
    if (start && end && new Date(end) <= new Date(start)) ctx.addIssue({ code: 'custom', path: ['expireAt'], message: 'Bitiş, başlangıçtan sonra olmalı.' })
  })
export type AnnouncementValues = z.infer<typeof announcementSchema>

export interface Target {
  scope: (typeof SCOPES)[number]
  audience: (typeof AUDIENCES)[number]
  block_ids?: string[]
  unit_ids?: string[]
  profile_ids?: string[]
}

/** What the form says -> the target the database wants. Named persons are always "everybody" (nothing to narrow). */
export function buildTarget(v: Pick<AnnouncementValues, 'scope' | 'audience' | 'blockIds' | 'unitIds' | 'profileIds'>): Target {
  switch (v.scope) {
    case 'site':
      return { scope: 'site', audience: v.audience }
    case 'blocks':
      return { scope: 'blocks', audience: v.audience, block_ids: v.blockIds }
    case 'units':
      return { scope: 'units', audience: v.audience, unit_ids: v.unitIds }
    case 'persons':
      return { scope: 'persons', audience: 'all', profile_ids: v.profileIds }
  }
}
