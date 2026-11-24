const GENERIC = 'İşlem şu anda yapılamadı. Lütfen biraz sonra tekrar deneyin.'

/** The database answers with short codes; people read Turkish. */
export function settingsErrorMessage(error: unknown): string {
  const e = error as { message?: string; code?: string } | null | undefined
  switch (e?.message) {
    case 'ydo_invalid':
      return 'YDO oranı 0 ile 100 arasında olmalı.'
    case 'commission_invalid':
      return 'Komisyonu kimin ödeyeceğini seçin.'
    case 'fee_invalid':
      return 'Taksit oranları 0 ile 10 arasında olmalı (yalnızca 2, 3, 6 ve 9 taksit için).'
    case 'due_day_invalid':
      return 'Son ödeme günü 1 ile 28 arasında olmalı.'
    case 'late_fee_invalid':
      return 'Gecikme oranı 0 ile 10 arasında olmalı.'
    case 'late_fee_method_invalid':
      return 'Gecikme yöntemini seçin.'
    case 'grace_invalid':
      return 'Ek süre 0 ile 60 gün arasında olmalı.'
    case 'name_invalid':
      return 'Ad 1 ile 100 karakter arasında olmalı.'
    case 'name_used':
      return 'Bu adda bir borç türü zaten var.'
    case 'split_invalid':
      return 'Dağıtım yöntemini seçin.'
    case 'type_in_active_plan':
      return 'Bu borç türünü kullanan etkin bir aylık plan var. Önce planı kapatın, sonra bu türü kapatın.'
    case 'type_protected':
      return 'Hazır gelen borç türleri silinemez; isterseniz kapatabilirsiniz.'
    case 'type_in_use':
      return 'Bu türde borç, toplu işlem ya da aylık plan var; silinemez. Kullanmak istemiyorsanız kapatın.'
    case 'invalid_request':
      return GENERIC
  }
  if (e?.code === '42501' || e?.message === 'not allowed') return 'Bu işlem için yetkiniz yok.'
  if (e?.code === '23514') return 'Girilen değer geçersiz. Alanları kontrol edin.'
  return GENERIC
}
