import { z } from 'zod'
import { passwordField } from '@/features/auth/auth-schemas'
import { residentContactSchema } from '@/features/admin/lib/schemas'

// The fields of the Profil page. Name and phone follow the SAME rule as the admin's "Bilgileri düzenle" in Sakinler,
// so data typed by the person and data typed by the management is held to one rule.
export const contactSchema = residentContactSchema
export type ContactValues = z.infer<typeof contactSchema>

export const passwordChangeSchema = z
  .object({
    current: z.string().min(1, 'Mevcut şifrenizi yazın.'),
    password: passwordField,
    confirm: z.string(),
  })
  .refine((values) => values.password === values.confirm, { path: ['confirm'], message: 'Şifreler aynı değil.' })
  .refine((values) => values.password !== values.current, { path: ['password'], message: 'Yeni şifre, mevcut şifrenizle aynı olamaz.' })
export type PasswordChangeValues = z.infer<typeof passwordChangeSchema>
