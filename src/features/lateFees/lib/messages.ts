const GENERIC = 'İşlem şu anda yapılamadı. Lütfen biraz sonra tekrar deneyin.'

/** The database answers with short codes ("preview_outdated"); people read Turkish. */
export function lateFeeErrorMessage(error: unknown): string {
  const e = error as { message?: string; code?: string } | null | undefined
  switch (e?.message) {
    case 'preview_outdated':
      return 'Listeyi gördükten sonra rakamlar değişti (yeni bir ödeme, yeni bir gün ya da başka bir yönetici). Hiçbir şey yazılmadı. Listeyi yenileyip tekrar kontrol edin.'
    case 'nothing_to_charge':
      return 'Yazılacak gecikme tazminatı kalmadı. Başka bir yönetici zaten yazmış olabilir. Listeyi yenileyin.'
    case 'late_fee_type_missing':
      return '“Gecikme Tazminatı” borç türü kapalı. Ayarlar sayfasındaki Borç türleri bölümünden açın, sonra tekrar deneyin.'
    case 'amount_too_large':
      return 'Toplam tutar 10.000.000 ₺’yi aşıyor. Satırların bir bölümünü seçip birkaç seferde yazın.'
    case 'request_id_used':
    case 'invalid_request':
      return GENERIC
  }
  if (e?.code === '42501' || e?.message === 'not allowed') return 'Bu işlem için yetkiniz yok.'
  return GENERIC
}
