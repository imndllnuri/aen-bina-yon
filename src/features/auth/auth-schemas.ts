import { z } from 'zod'

// Same rule as supabase/config.toml: minimum_password_length = 8.
// The upper limit is bcrypt's: Supabase only uses the first 72 BYTES of a password
// (Turkish letters such as ş, ğ, ı take 2 bytes each).
export const MIN_PASSWORD_LENGTH = 8
export const MAX_PASSWORD_BYTES = 72

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const emailField = z
  .string()
  .trim()
  .min(1, 'E-posta adresinizi yazın.')
  .refine((value) => value === '' || EMAIL.test(value), 'Geçerli bir e-posta adresi yazın.')

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, 'Şifrenizi yazın.'),
  remember: z.boolean(),
})
export type LoginValues = z.infer<typeof loginSchema>

export const forgotSchema = z.object({ email: emailField })
export type ForgotValues = z.infer<typeof forgotSchema>

export const newPasswordSchema = z
  .object({
    password: z
      .string()
      .min(MIN_PASSWORD_LENGTH, `Şifre en az ${MIN_PASSWORD_LENGTH} karakter olmalı.`)
      .refine((value) => new TextEncoder().encode(value).length <= MAX_PASSWORD_BYTES, 'Şifre çok uzun. Daha kısa bir şifre seçin.'),
    confirm: z.string(),
  })
  .refine((values) => values.password === values.confirm, {
    path: ['confirm'],
    message: 'Şifreler aynı değil.',
  })
export type NewPasswordValues = z.infer<typeof newPasswordSchema>
