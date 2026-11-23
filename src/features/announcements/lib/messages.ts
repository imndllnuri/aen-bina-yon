const GENERIC = 'İşlem şu anda yapılamadı. Lütfen biraz sonra tekrar deneyin.'
type DbError = { message?: string; code?: string } | null | undefined

/** The database answers with short codes ("no_recipients"); people read Turkish. */
export function announcementErrorMessage(error: unknown): string {
  const e = error as DbError
  switch (e?.message) {
    case 'title_invalid':
      return 'Başlık en az 3, en fazla 120 karakter olmalı.'
    case 'body_invalid':
      return 'Metin boş olamaz ve en fazla 5000 karakter olabilir.'
    case 'type_invalid':
      return 'Duyuru türünü seçin.'
    case 'date_invalid':
      return 'Tarihler geçerli değil. Bitiş zamanı gelecekte ve başlangıçtan sonra olmalı; başlangıç en fazla bir yıl sonra olabilir.'
    case 'target_invalid':
      return 'Alıcı seçimi geçerli değil. Seçtiğiniz blok, daire ya da kişiler bu sitede olmalı ve şu anda orada oturmalı.'
    case 'locked_after_publish':
      return 'Yayınlanmış bir duyurunun alıcıları ve başlangıç zamanı değiştirilemez. Önce “Yayından kaldır”ı kullanın.'
    case 'no_recipients':
      return 'Bu seçimde alıcı yok. Seçimi değiştirin.'
    case 'not_published':
      return 'Bu duyuru zaten yayında değil. Sayfayı yenileyin.'
    case 'not_active':
      return 'Bu duyuru şu anda yayında değil (başlamamış, süresi dolmuş ya da yayından kaldırılmış).'
    case 'resend_too_soon':
      return 'Hatırlatma en fazla saatte bir gönderilebilir. Biraz sonra tekrar deneyin.'
  }
  if (e?.code === '42501') return 'Bu işlem için yetkiniz yok.'
  return GENERIC
}
