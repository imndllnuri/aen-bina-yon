import { supabase } from '@/lib/supabase'

export type AuthFailure =
  | 'invalid-credentials'
  | 'email-not-confirmed'
  | 'rate-limited'
  | 'weak-password'
  | 'same-password'
  | 'banned'
  | 'no-session'
  | 'not-configured'
  | 'failed'

export type AuthResult = { ok: true } | { ok: false; reason: AuthFailure }

/** Messages for people. One place, so every page says the same thing. */
export const authMessages: Record<AuthFailure, string> = {
  'invalid-credentials': 'E-posta adresi veya şifre hatalı.',
  'email-not-confirmed': 'E-posta adresiniz henüz doğrulanmamış. Lütfen yönetimle iletişime geçin.',
  'rate-limited': 'Çok fazla deneme yapıldı. Lütfen biraz bekleyip tekrar deneyin.',
  'weak-password': 'Bu şifre çok zayıf. Daha uzun ve tahmin edilmesi zor bir şifre seçin.',
  'same-password': 'Yeni şifre, eski şifrenizle aynı olamaz.',
  banned: 'Hesabınız devre dışı bırakılmış. Lütfen yönetimle iletişime geçin.',
  'no-session': 'Oturumunuz bulunamadı. Lütfen e-postadaki bağlantıyı yeniden açın.',
  'not-configured': 'Sunucu bağlantısı henüz kurulmadı. Lütfen daha sonra tekrar deneyin.',
  failed: 'İşlem şu anda yapılamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.',
}

interface AuthLikeError {
  code?: string
  name?: string
  status?: number
}

/** Turns a Supabase auth error into one of our reasons. */
export function classifyAuthError(error: AuthLikeError): AuthFailure {
  switch (error.code) {
    case 'invalid_credentials':
      return 'invalid-credentials'
    case 'email_not_confirmed':
      return 'email-not-confirmed'
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
    case 'over_sms_send_rate_limit':
      return 'rate-limited'
    case 'weak_password':
      return 'weak-password'
    case 'same_password':
      return 'same-password'
    case 'user_banned':
      return 'banned'
    case 'session_not_found':
    case 'session_expired':
      return 'no-session'
  }
  if (error.name === 'AuthSessionMissingError') return 'no-session'
  if (error.status === 429) return 'rate-limited'
  return 'failed'
}

export async function signInWithPassword(email: string, password: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, reason: 'not-configured' }
  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error ? { ok: false, reason: classifyAuthError(error) } : { ok: true }
  } catch {
    return { ok: false, reason: 'failed' }
  }
}

/**
 * Sends the password-reset e-mail.
 * It gives the SAME answer whether or not the address has an account. Otherwise anyone could
 * type addresses and learn who is registered. Only problems that do not depend on the address
 * (rate limit, no network) are reported.
 *
 * Note for the free Supabase plan: the built-in e-mail service only delivers to members of
 * your Supabase organization (error "email_address_not_authorized"). That is treated as
 * success here, so the screen never reveals it. Set up custom SMTP before real use.
 */
export async function requestPasswordReset(email: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, reason: 'not-configured' }
  try {
    // BASE_URL is "/aen-bina-yon/" on GitHub Pages. The link in the e-mail brings the person here;
    // the address must be on the "Redirect URLs" list in Supabase (see supabase/config.toml).
    const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}`
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
    if (!error) return { ok: true }

    const reason = classifyAuthError(error)
    if (reason === 'rate-limited') return { ok: false, reason }
    if (error.code === 'email_address_not_authorized') {
      console.warn('Reset e-mail was not sent: the free Supabase e-mail service only sends to organization members.')
      return { ok: true }
    }
    console.warn('Password reset request failed:', error.code ?? error.name)
    return { ok: false, reason: 'failed' }
  } catch {
    return { ok: false, reason: 'failed' }
  }
}

export async function updatePassword(password: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, reason: 'not-configured' }
  try {
    const { error } = await supabase.auth.updateUser({ password })
    return error ? { ok: false, reason: classifyAuthError(error) } : { ok: true }
  } catch {
    return { ok: false, reason: 'failed' }
  }
}

/**
 * Records that the signed-in person accepted this version of the KVKK notice.
 * The database function only ever writes the CALLER's own profile.
 */
export async function acceptKvkk(version: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, reason: 'not-configured' }
  try {
    const { error } = await supabase.rpc('accept_kvkk', { p_version: version })
    return error ? { ok: false, reason: classifyAuthError(error) } : { ok: true }
  } catch {
    return { ok: false, reason: 'failed' }
  }
}
