// Small pure helpers for the payment screens: installment choices, Turkish messages, the selection total.

export const INSTALLMENT_OPTIONS = [
  { value: 1, label: 'Tek Çekim' },
  { value: 2, label: '2 Taksit' },
  { value: 3, label: '3 Taksit' },
  { value: 6, label: '6 Taksit' },
  { value: 9, label: '9 Taksit' },
] as const

/** The total of the selected lines, in whole kuruş. Only a preview: the checkout asks the database for the real quote. */
export function selectionKurus(lines: { id: string; remainingKurus: number }[], selected: ReadonlySet<string>): number {
  return lines.reduce((total, line) => (selected.has(line.id) ? total + line.remainingKurus : total), 0)
}

const GENERIC = 'İşlem şu anda yapılamadı. Lütfen biraz sonra tekrar deneyin.'

type DbError = { message?: string; code?: string } | null | undefined

/** The database answers with short codes ("quote_outdated"); people read Turkish. */
export function paymentErrorMessage(error: unknown): string {
  const e = error as DbError
  switch (e?.message) {
    case 'charge_not_payable':
      return 'Seçtiğiniz borçlardan biri artık ödenemiyor (iptal edilmiş ya da size açık değil). Borçlarım sayfasına dönüp yeniden seçin.'
    case 'already_paid':
      return 'Seçtiğiniz borçlardan biri zaten ödenmiş. Borçlarım sayfasına dönüp yeniden seçin.'
    case 'one_unit_only':
      return 'Bir ödeme tek bir daire için yapılabilir. Borçlarım sayfasında tek daireyi seçin.'
    case 'charges_invalid':
      return 'Önce ödemek istediğiniz borçları seçin.'
    case 'installments_invalid':
      return 'Taksit seçimi geçerli değil.'
    case 'quote_outdated':
      return 'Tutar bu arada değişti. Ödeme özetine dönüp yeni tutarı kontrol edin.'
    case 'payment_disabled':
      return 'Online ödeme şu anda kapalı. Ödemenizi site yönetimine iletin.'
    case 'request_id_used':
    case 'invalid_request':
      return GENERIC
  }
  if (e?.code === '42501') return 'Bu işlem için yetkiniz yok.'
  return GENERIC
}
