import { authMessages, type AuthFailure } from '@/features/auth/auth-api'

const GENERIC = 'İşlem şu anda yapılamadı. Lütfen biraz sonra tekrar deneyin.'

/** The database answers with short codes; people read Turkish. */
export function profileErrorMessage(error: unknown): string {
  const e = error as { message?: string; code?: string } | null | undefined
  if (e?.message === 'prefs_invalid') return GENERIC
  if (e?.code === '42501' || e?.message === 'not allowed') return 'Bu işlem için yetkiniz yok. Hesabınız devre dışı olabilir; lütfen yönetimle iletişime geçin.'
  if (e?.code === '23514') return 'Girilen değer geçersiz. Alanları kontrol edin.'
  return GENERIC
}

export type PasswordChangeFailure = AuthFailure | 'wrong-current'

/** Messages of the password change. "wrong-current" is ours: the login check of the current password failed. */
export function passwordChangeMessage(reason: PasswordChangeFailure): string {
  if (reason === 'wrong-current') return 'Mevcut şifre hatalı.'
  return authMessages[reason]
}
