import { z } from 'zod'
import type { Database } from '@/lib/database.types'

// Rules for the public "Teklif Al" form. They mirror the CHECK constraints of the
// quote_requests table (supabase/migrations/0001_core.sql), so people see a friendly
// Turkish message here instead of a database error. The database stays the real guard.

export const BUILDING_TYPES = [
  { value: 'apartman', label: 'Apartman' },
  { value: 'site', label: 'Site (birden fazla blok)' },
  { value: 'is_merkezi', label: 'İş merkezi / plaza' },
  { value: 'diger', label: 'Diğer' },
] as const

const BUILDING_VALUES: string[] = BUILDING_TYPES.map((type) => type.value)

const PHONE_CHARS = /^\+?[0-9\s()-]+$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const digitCount = (value: string) => value.replace(/\D/g, '').length

export const quoteSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'Lütfen adınızı ve soyadınızı yazın.')
      .max(120, 'En fazla 120 karakter yazabilirsiniz.'),
    phone: z
      .string()
      .trim()
      .refine(
        (value) =>
          value === '' ||
          (PHONE_CHARS.test(value) && value.length <= 30 && digitCount(value) >= 10 && digitCount(value) <= 13),
        'Geçerli bir telefon numarası yazın. Örnek: 0532 000 00 00',
      ),
    email: z
      .string()
      .trim()
      .refine((value) => value === '' || (EMAIL.test(value) && value.length <= 200), 'Geçerli bir e-posta adresi yazın.'),
    buildingType: z.string().refine((value) => BUILDING_VALUES.includes(value), 'Lütfen yapı tipini seçin.'),
    unitCount: z
      .string()
      .trim()
      .refine(
        (value) => /^\d{1,6}$/.test(value) && Number(value) >= 1 && Number(value) <= 100000,
        '1 ile 100.000 arasında bir sayı yazın.',
      ),
    il: z.string().trim().min(2, 'Lütfen ilinizi yazın.').max(80, 'En fazla 80 karakter yazabilirsiniz.'),
    ilce: z.string().trim().max(80, 'En fazla 80 karakter yazabilirsiniz.'),
    message: z.string().trim().max(2000, 'Mesajınız en fazla 2000 karakter olabilir.'),
    // Aydınlatma metni (KVKK notice) acknowledgement. Checked in the browser only.
    kvkk: z.boolean().refine((value) => value === true, 'Devam etmek için aydınlatma metnini okuduğunuzu onaylayın.'),
    // Honeypot: a field real people never see. Bots that fill every field give themselves away.
    website: z.string(),
  })
  .refine((values) => values.phone !== '' || values.email !== '', {
    path: ['phone'],
    message: 'Telefon veya e-posta alanlarından en az birini doldurun.',
  })

export type QuoteFormValues = z.infer<typeof quoteSchema>

export const emptyQuoteForm: QuoteFormValues = {
  name: '',
  phone: '',
  email: '',
  buildingType: '',
  unitCount: '',
  il: '',
  ilce: '',
  message: '',
  kvkk: false,
  website: '',
}

export type QuoteInsert = Database['public']['Tables']['quote_requests']['Insert']

/**
 * Turns the form values into a table row. Only columns the visitor role may write are set:
 * never id, status or created_at (the database grants "anon" insert on the listed columns only).
 */
export function toQuoteRow(values: QuoteFormValues): QuoteInsert {
  const orNull = (text: string) => (text === '' ? null : text)
  return {
    name: values.name,
    phone: orNull(values.phone),
    email: orNull(values.email),
    building_type: values.buildingType,
    unit_count: Number(values.unitCount),
    il: values.il,
    ilce: orNull(values.ilce),
    message: orNull(values.message),
  }
}
