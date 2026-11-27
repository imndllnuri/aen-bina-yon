const GENERIC = 'İşlem şu anda yapılamadı. Lütfen biraz sonra tekrar deneyin.'

/** What the invite function answers when a person is invited as an ADMIN (codes of supabase/functions/invite-resident/logic.ts). */
export const adminInviteMessages: Record<string, string> = {
  forbidden: 'Bu işlem için yetkiniz yok.',
  already_linked: 'Bu kişi zaten bu sitenin yöneticisi.',
  email_in_use_elsewhere: 'Bu e-posta adresi başka bir firmanın hesabında kullanılıyor. Lütfen farklı bir adres deneyin.',
  account_inactive: 'Bu kişinin hesabı devre dışı. Önce hesabı yeniden etkinleştirin.',
  already_active: 'Bu kişi hesabını zaten etkinleştirmiş. Şifresini kendisi e-posta ile yenileyebilir.',
  invalid_request: 'Girilen bilgiler geçerli değil. Lütfen kontrol edin.',
  origin_not_allowed: 'Bu adresten davet gönderilemez.',
  failed: GENERIC,
}
export const adminInviteMessage = (code: string) => adminInviteMessages[code] ?? GENERIC

/** The database answers with short codes; people read Turkish. */
export function adminsErrorMessage(error: unknown): string {
  const e = error as { message?: string; code?: string } | null | undefined
  switch (e?.message) {
    case 'cannot_remove_self':
      return 'Kendinizi yönetici listesinden çıkaramazsınız. Başka bir yönetici sizi çıkarabilir.'
    case 'not_admin':
      return 'Bu kişi bu sitenin yöneticisi değil (belki zaten çıkarılmış). Listeyi yenileyin.'
  }
  if (e?.code === '42501' || e?.message === 'not allowed') return 'Bu işlem için yetkiniz yok.'
  return GENERIC
}
