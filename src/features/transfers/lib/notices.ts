// Words and rules for transfer notices (havale bildirimi). Pure functions: easy to test.

export type NoticeStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'
export type PaymentStatus = 'approved' | 'voided'

export interface StatusInfo {
  label: string
  /** Which badge colour to use. */
  tone: 'waiting' | 'good' | 'bad' | 'neutral'
}

/**
 * What the person reads. An approved notice whose payment was cancelled later must NOT say "Onaylandı":
 * the lines are unpaid again (the notice itself stays "approved" in the database; the screens show both).
 */
export function noticeStatusInfo(status: NoticeStatus, paymentStatus: PaymentStatus | null): StatusInfo {
  switch (status) {
    case 'pending':
      return { label: 'Onay bekliyor', tone: 'waiting' }
    case 'approved':
      return paymentStatus === 'voided' ? { label: 'Ödeme iptal edildi', tone: 'bad' } : { label: 'Onaylandı', tone: 'good' }
    case 'rejected':
      return { label: 'Reddedildi', tone: 'bad' }
    case 'cancelled':
      return { label: 'Geri çekildi', tone: 'neutral' }
  }
}

const GENERIC = 'İşlem şu anda yapılamadı. Lütfen biraz sonra tekrar deneyin.'

type DbError = { message?: string; code?: string; statusCode?: string | number; error?: string } | null | undefined

/** The database answers with short codes ("file_invalid"); people read Turkish. */
export function transferErrorMessage(error: unknown): string {
  const e = error as DbError
  switch (e?.message) {
    case 'amount_invalid':
      return 'Tutar geçerli değil. 0’dan büyük, en fazla 1.000.000 ₺ olan bir tutar yazın (havale bildiriminde en az 1 ₺).'
    case 'date_invalid':
      return 'Tarih geçerli değil. Gelecekteki bir tarih ya da çok eski bir tarih seçilemez.'
    case 'sender_invalid':
      return 'Gönderen adını yazın (en az 2, en fazla 100 karakter).'
    case 'note_invalid':
      return 'Açıklama en fazla 300 karakter olabilir.'
    case 'file_invalid':
      return 'Dekont dosyası yüklenemedi ya da bu daireye ait değil. Dosyayı yeniden seçip tekrar deneyin.'
    case 'file_used':
      return 'Bu dekont daha önce kullanılmış. Dosyayı yeniden seçin.'
    case 'too_many_pending':
      return 'Bu daire için bekleyen 5 bildirim var. Yönetim onaylayana ya da siz geri çekene kadar yenisini gönderemezsiniz.'
    case 'not_pending':
      return 'Bu bildirim artık beklemiyor (onaylanmış, reddedilmiş ya da geri çekilmiş). Sayfayı yenileyin.'
    case 'reason_invalid':
      return 'Neden en az 3, en fazla 300 karakter olmalı.'
    case 'method_invalid':
      return 'Ödeme yöntemini seçin.'
    case 'payer_invalid':
      return 'Ödeyen kişi bu dairede oturmuyor. Başka bir kişi seçin ya da adı elle yazın.'
    case 'payer_name_invalid':
      return 'Ödeyen kişinin adını yazın (en az 2 karakter).'
    case 'charges_invalid':
      return 'Borç seçimi geçerli değil. En az bir borç seçin.'
    case 'charge_not_payable':
      return 'Seçilen borçlardan biri bu ödeme için uygun değil (iptal edilmiş, başka daireye ait ya da ödeyen kişiye açık değil).'
    case 'already_paid':
      return 'Seçilen borçlardan biri zaten ödenmiş. Listeyi yenileyin.'
    case 'no_open_lines':
      return 'Bu ödeme için kapatılabilecek açık borç yok. Bildirimi nedenini yazarak reddedebilirsiniz.'
    case 'amount_exceeds_debt':
      return 'Tutar, kapatılabilecek açık borçtan büyük. Fazla ödeme (alacak) henüz desteklenmiyor: tutarı düşürün ya da bildirimi nedenini yazarak reddedin.'
    case 'iban_invalid':
      return 'IBAN geçerli değil. TR ile başlayan 26 karakterlik IBAN’ı kontrol edin.'
    case 'accounts_invalid':
      return 'Banka hesapları geçerli değil: her hesapta banka, hesap sahibi ve IBAN olmalı; en fazla 5 hesap, aynı IBAN iki kez olamaz.'
    case 'allocation_mismatch':
    case 'request_id_used':
    case 'invalid_request':
      return GENERIC
  }
  if (e?.code === '42501') return 'Bu işlem için yetkiniz yok.'
  if (e?.statusCode === '413' || e?.statusCode === 413) return 'Dosya çok büyük (en fazla 5 MB).'
  if (e?.statusCode === '415' || e?.statusCode === 415) return 'Bu dosya türü kabul edilmiyor. PDF, JPG veya PNG yükleyin.'
  return GENERIC
}
