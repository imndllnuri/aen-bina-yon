import { z } from 'zod'
import type { Database } from '@/lib/database.types'

// Form rules for the admin pages. They mirror the CHECK constraints in
// supabase/migrations/0001_core.sql, so people see a friendly Turkish message first.
// The database stays the real guard.

export const UNIT_TYPES = [
  { value: 'konut', label: 'Konut' },
  { value: 'dukkan', label: 'Dükkân' },
  { value: 'ofis', label: 'Ofis' },
  { value: 'depo', label: 'Depo' },
  { value: 'otopark', label: 'Otopark' },
  { value: 'diger', label: 'Diğer' },
] as const

export const UNIT_STATUSES = [
  { value: 'occupied', label: 'Dolu' },
  { value: 'vacant', label: 'Boş' },
] as const

export const RELATIONS = [
  { value: 'owner', label: 'Kat Maliki' },
  { value: 'tenant', label: 'Kiracı' },
] as const

const TYPE_VALUES: string[] = UNIT_TYPES.map((t) => t.value)
const STATUS_VALUES: string[] = UNIT_STATUSES.map((s) => s.value)
const RELATION_VALUES: string[] = RELATIONS.map((r) => r.value)

/** "95,5" and "95.5" both mean 95.5. Returns null for empty text, NaN for something that is not a number. */
export function parseDecimal(text: string): number | null {
  const clean = text.trim().replace(',', '.')
  if (clean === '') return null
  return /^\d+(\.\d+)?$/.test(clean) ? Number(clean) : Number.NaN
}

const optionalPositive = (label: string, max: number, decimals: number) =>
  z
    .string()
    .trim()
    .refine((value) => {
      const number = parseDecimal(value)
      if (number === null) return true
      const places = value.replace(',', '.').split('.')[1]?.length ?? 0
      return Number.isFinite(number) && number > 0 && number <= max && places <= decimals
    }, `${label}: 0'dan büyük, en fazla ${decimals} ondalıklı bir sayı yazın.`)

export const blockSchema = z.object({
  name: z.string().trim().min(1, 'Blok adını yazın.').max(100, 'En fazla 100 karakter yazabilirsiniz.'),
})
export type BlockFormValues = z.infer<typeof blockSchema>

export const unitSchema = z.object({
  blockId: z.string().min(1, 'Bloğu seçin.'),
  doorNo: z.string().trim().min(1, 'Kapı numarasını yazın.').max(20, 'En fazla 20 karakter yazabilirsiniz.'),
  floor: z.string().trim().refine((v) => v === '' || (/^-?\d{1,3}$/.test(v) && Number(v) >= -10 && Number(v) <= 200), 'Kat: -10 ile 200 arasında bir tam sayı yazın.'),
  type: z.string().refine((v) => TYPE_VALUES.includes(v), 'Daire tipini seçin.'),
  grossM2: optionalPositive('Brüt m²', 99999.99, 2),
  landShare: optionalPositive('Arsa payı', 99999999.9999, 4),
  status: z.string().refine((v) => STATUS_VALUES.includes(v), 'Durumu seçin.'),
})
export type UnitFormValues = z.infer<typeof unitSchema>

export const emptyUnitForm: UnitFormValues = {
  blockId: '',
  doorNo: '',
  floor: '',
  type: 'konut',
  grossM2: '',
  landShare: '',
  status: 'occupied',
}

type UnitInsert = Database['public']['Tables']['units']['Insert']

export function toUnitRow(values: UnitFormValues): UnitInsert {
  return {
    block_id: values.blockId,
    door_no: values.doorNo,
    floor: values.floor === '' ? null : Number(values.floor),
    type: values.type,
    gross_m2: parseDecimal(values.grossM2),
    land_share: parseDecimal(values.landShare),
    status: values.status,
  }
}

const int = (label: string, min: number, max: number) =>
  z.string().trim().refine((v) => /^-?\d{1,6}$/.test(v) && Number(v) >= min && Number(v) <= max, `${label}: ${min} ile ${max} arasında bir tam sayı yazın.`)

export const bulkSchema = z.object({
  blockId: z.string().min(1, 'Bloğu seçin.'),
  floors: int('Kat sayısı', 1, 100),
  perFloor: int('Katta daire sayısı', 1, 50),
  startNumber: int('Başlangıç kapı numarası', 1, 99999),
  startFloor: int('Başlangıç katı', -10, 200),
  type: z.string().refine((v) => TYPE_VALUES.includes(v), 'Daire tipini seçin.'),
  grossM2: optionalPositive('Brüt m²', 99999.99, 2),
  landShare: optionalPositive('Arsa payı', 99999999.9999, 4),
})
export type BulkFormValues = z.infer<typeof bulkSchema>

const PHONE = /^\+?[0-9\s()-]{7,30}$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const inviteSchema = z.object({
  fullName: z.string().trim().min(2, 'Ad soyad en az 2 karakter olmalı.').max(200, 'En fazla 200 karakter yazabilirsiniz.'),
  email: z.string().trim().refine((v) => EMAIL.test(v) && v.length <= 200, 'Geçerli bir e-posta adresi yazın.'),
  phone: z.string().trim().refine((v) => v === '' || PHONE.test(v), 'Geçerli bir telefon numarası yazın. Örnek: 0532 000 00 00'),
  unitId: z.string().min(1, 'Daireyi seçin.'),
  relation: z.string().refine((v) => RELATION_VALUES.includes(v), 'Malik mi kiracı mı, seçin.'),
  startDate: z.string().refine((v) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Geçerli bir tarih seçin.'),
})
export type InviteFormValues = z.infer<typeof inviteSchema>

export const residentContactSchema = z.object({
  fullName: z.string().trim().min(2, 'Ad soyad en az 2 karakter olmalı.').max(200, 'En fazla 200 karakter yazabilirsiniz.'),
  phone: z.string().trim().refine((v) => v === '' || PHONE.test(v), 'Geçerli bir telefon numarası yazın. Örnek: 0532 000 00 00'),
})
export type ResidentContactValues = z.infer<typeof residentContactSchema>
