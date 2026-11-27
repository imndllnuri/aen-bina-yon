import { z } from 'zod'
import type { Database } from '@/lib/database.types'
import { emailField, phoneField } from './quote-schema'

// Rules for the public contact form (İletişim). They mirror the CHECK constraints of contact_messages
// (supabase/migrations/0011_contact_messages.sql), so people see a friendly Turkish message here instead of a database error.
// The database stays the real guard.

export const contactSchema = z
  .object({
    name: z.string().trim().min(2, 'Lütfen adınızı ve soyadınızı yazın.').max(120, 'En fazla 120 karakter yazabilirsiniz.'),
    phone: phoneField,
    email: emailField,
    message: z.string().trim().min(5, 'Lütfen mesajınızı yazın (en az 5 karakter).').max(2000, 'Mesajınız en fazla 2000 karakter olabilir.'),
    // Aydınlatma metni (KVKK notice) acknowledgement. Checked in the browser only.
    kvkk: z.boolean().refine((value) => value === true, 'Devam etmek için aydınlatma metnini okuduğunuzu onaylayın.'),
    // Honeypot: a field real people never see. Bots that fill every field give themselves away.
    website: z.string(),
  })
  .refine((values) => values.phone !== '' || values.email !== '', {
    path: ['phone'],
    message: 'Telefon veya e-posta alanlarından en az birini doldurun.',
  })

export type ContactFormValues = z.infer<typeof contactSchema>

export const emptyContactForm: ContactFormValues = { name: '', phone: '', email: '', message: '', kvkk: false, website: '' }

export type ContactInsert = Database['public']['Tables']['contact_messages']['Insert']

/**
 * Turns the form values into a table row. Only the four columns the visitor role may write are set:
 * never id, status, admin_note or created_at.
 */
export function toContactRow(values: ContactFormValues): ContactInsert {
  const orNull = (text: string) => (text === '' ? null : text)
  return { name: values.name, phone: orNull(values.phone), email: orNull(values.email), message: values.message }
}
