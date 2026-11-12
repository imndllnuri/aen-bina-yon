import { currentMonthIstanbul, monthLabel, todayIstanbul } from '@/lib/format'

// Pure helpers for the Borçlandırma (charges) pages: labels, month lists, status, error messages.
// Nothing here talks to the network, so everything can be tested on its own.
// Money rule: the database does all splitting. These helpers never calculate a charge.

export type SplitMethod = 'per_unit' | 'equal' | 'land_share' | 'gross_m2'

export const SPLIT_METHODS: { value: SplitMethod; label: string; amountLabel: string; hint: string }[] = [
  {
    value: 'per_unit',
    label: 'Daire başı sabit tutar',
    amountLabel: 'Her dairenin tutarı',
    hint: 'Her daire aynı tutarı öder. Aylık aidat için en yaygın yöntem.',
  },
  {
    value: 'equal',
    label: 'Eşit paylaşım',
    amountLabel: 'Paylaştırılacak toplam tutar',
    hint: 'Toplam tutar dairelere eşit bölünür. Kapıcı, kaloriferci gibi personel giderleri için (KMK m. 20).',
  },
  {
    value: 'land_share',
    label: 'Arsa payına göre',
    amountLabel: 'Paylaştırılacak toplam tutar',
    hint: 'Toplam tutar arsa payı oranında bölünür. Yönetim planı başka türlü söylemiyorsa diğer ortak giderler için (KMK m. 20).',
  },
  {
    value: 'gross_m2',
    label: 'Brüt m²’ye göre',
    amountLabel: 'Paylaştırılacak toplam tutar',
    hint: 'Toplam tutar dairelerin brüt m² oranında bölünür (örneğin yakıt).',
  },
]

export const SPLIT_LABELS: Record<SplitMethod, string> = {
  per_unit: 'Daire başı',
  equal: 'Eşit paylaşım',
  land_share: 'Arsa payına göre',
  gross_m2: 'Brüt m²’ye göre',
}

// hasOwn, not `in`: "toString" is "in" every object.
export const isSplitMethod = (value: string): value is SplitMethod => Object.hasOwn(SPLIT_LABELS, value)

/** Which dairies get the charge. This is the same JSON the database function reads. */
export type ChargeTarget =
  | { scope: 'site' }
  | { scope: 'block'; block_id: string }
  | { scope: 'units'; unit_ids: string[] }

export function describeTarget(target: unknown, blockNames: Record<string, string>): string {
  const t = target as { scope?: string; block_id?: string; unit_ids?: unknown[] } | null
  if (t?.scope === 'site') return 'Tüm site'
  if (t?.scope === 'block') return (t.block_id && blockNames[t.block_id]) || 'Blok'
  if (t?.scope === 'units') return `${Array.isArray(t.unit_ids) ? t.unit_ids.length : 0} daire`
  return '—'
}

// ---------------------------------------------------------------------------
// Months (a "dönem" is stored as the first day of a month: "2026-11-01")
// ---------------------------------------------------------------------------
// monthLabel() and currentMonthIstanbul() live in @/lib/format (the resident pages use them too).
export { currentMonthIstanbul, monthLabel }

/** Months for a dropdown: `back` months before the current one, the current one, `forward` after. Newest first. */
export function monthOptions(now: Date = new Date(), back = 12, forward = 2): { value: string; label: string }[] {
  const [year, month] = currentMonthIstanbul(now).split('-').map(Number)
  const options: { value: string; label: string }[] = []
  for (let offset = forward; offset >= -back; offset--) {
    const index = year * 12 + (month - 1) + offset
    const value = `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}-01`
    options.push({ value, label: monthLabel(value) })
  }
  return options
}

/** The due date a monthly plan gives to a month: "2026-11-01" + day 5 -> "2026-11-05". */
export function dueDateFor(period: string, dayOfMonth: number): string {
  return `${period.slice(0, 8)}${String(dayOfMonth).padStart(2, '0')}`
}

// ---------------------------------------------------------------------------
// Status of one charge line (until payments exist, a line is either open, overdue or cancelled)
// ---------------------------------------------------------------------------
export type ChargeStatus = 'open' | 'overdue' | 'partial' | 'paid' | 'voided'

export const STATUS_LABELS: Record<ChargeStatus, string> = {
  open: 'Ödenmedi',
  overdue: 'Gecikmiş',
  partial: 'Kısmi',
  paid: 'Ödendi',
  voided: 'İptal',
}

export function chargeStatus(charge: { voided_at: string | null; due_date: string }, today: string = todayIstanbul()): ChargeStatus {
  if (charge.voided_at) return 'voided'
  // Both are YYYY-MM-DD, so comparing the text compares the dates. Due today is not yet late.
  return charge.due_date < today ? 'overdue' : 'open'
}

// ---------------------------------------------------------------------------
// Hard delete is allowed for 15 minutes after a batch is made (the database enforces it)
// ---------------------------------------------------------------------------
export const DELETE_WINDOW_MS = 15 * 60 * 1000

export const canDeleteBatch = (createdAt: string, now: Date = new Date()) => now.getTime() - new Date(createdAt).getTime() < DELETE_WINDOW_MS

// ---------------------------------------------------------------------------
// Error messages. The database answers with short codes ("preview_outdated"); people read Turkish.
// ---------------------------------------------------------------------------
const GENERIC = 'İşlem şu anda yapılamadı. Lütfen biraz sonra tekrar deneyin.'

export interface ChargeErrorContext {
  split?: SplitMethod
}

type DbError = { message?: string; details?: string | null; code?: string } | null | undefined

export function chargeErrorMessage(error: unknown, context: ChargeErrorContext = {}): string {
  const e = error as DbError
  const code = e?.message ?? ''
  const detail = e?.details?.trim() ?? ''

  switch (code) {
    case 'target_invalid':
      return 'Seçilen daireler bu siteye ait değil ya da arşivlenmiş. Sayfayı yenileyip tekrar deneyin.'
    case 'no_units':
      return 'Seçilen hedefte borçlandırılacak daire yok.'
    case 'split_invalid':
      return 'Paylaştırma yöntemi geçerli değil.'
    case 'amount_invalid':
      return 'Tutar 0,01 ₺ ile 9.999.999,99 ₺ arasında olmalı.'
    case 'amount_too_small':
      return `Bu tutar daire sayısına bölünemeyecek kadar küçük: ${detail ? `${detail} dairesine` : 'bazı dairelere'} 0,00 ₺ düşüyor. Daha büyük bir tutar yazın.`
    case 'missing_weight': {
      const what = context.split === 'gross_m2' ? 'brüt m²' : 'arsa payı'
      return `Şu dairelerde ${what} yazılı değil: ${detail || '—'}. Önce Daireler sayfasından doldurun ya da başka bir paylaştırma yöntemi seçin.`
    }
    case 'preview_outdated':
      return 'Önizlemeden sonra daireler ya da değerler değişti. Önizlemeyi yenileyin ve tekrar kontrol edin.'
    case 'charge_type_invalid':
      return 'Borç türü geçerli değil.'
    case 'period_invalid':
      return 'Dönem geçerli değil.'
    case 'due_date_invalid':
      return 'Son ödeme tarihi geçerli değil.'
    case 'description_invalid':
      return 'Açıklama en fazla 200 karakter olabilir.'
    case 'karar_invalid':
      return 'Karar numarası ve karar tarihini birlikte yazın.'
    case 'karar_required':
      return `Tutar, önceki plana göre yıllık yeniden değerleme oranını (%${detail || '—'}) aşıyor. Kat malikleri kurulunun karar numarasını ve tarihini yazın.`
    case 'already_generated':
      return 'Bu plan için bu ay zaten borç oluşturulmuş. Yanlışsa önce “Toplu işlemler” sekmesinden iptal edin.'
    case 'plan_inactive':
      return 'Bu plan kapalı. Önce planı etkinleştirin.'
    case 'name_invalid':
      return 'Plan adını yazın (en fazla 100 karakter).'
    case 'day_invalid':
      return 'Son ödeme günü 1 ile 28 arasında olmalı.'
    case 'reason_invalid':
      return 'İptal nedeni en az 3, en fazla 300 karakter olmalı.'
    case 'charge_paid':
      return 'Bu borcun ödemesi alınmış. Önce Tahsilatlar sayfasından ödemeyi iptal edin.'
    case 'batch_has_payments':
      return 'Bu işlemdeki borçlardan biri için ödeme alınmış. Önce Tahsilatlar sayfasından ödemeyi iptal edin.'
    case 'already_voided':
      return 'Bu kayıt zaten iptal edilmiş.'
    case 'delete_window_closed':
      return 'Silme süresi (15 dakika) doldu. Bunun yerine iptal edin.'
    case 'charge_voided':
      return 'İptal edilmiş bir borcun tutarı, son ödeme tarihi ve kiracı görünürlüğü değiştirilemez.'
    case 'request_id_used':
    case 'invalid_request':
      return GENERIC
  }

  if (e?.code === '42501') return 'Bu işlem için yetkiniz yok.'
  if (e?.code === '23514') return 'Girilen değer geçersiz (tutar 0,01 ₺ ile 9.999.999,99 ₺ arasında olmalı).'
  return GENERIC
}

// ---------------------------------------------------------------------------
// Targets (which units a charge goes to)
// ---------------------------------------------------------------------------

/** Is this target complete enough to ask the database about? (The database checks it again.) */
export function isTargetComplete(target: ChargeTarget): boolean {
  if (target.scope === 'block') return target.block_id !== ''
  if (target.scope === 'units') return target.unit_ids.length > 0
  return true
}

/** How many units a target means, for the text under the picker. Archived units are not in `units`. */
export function targetUnitCount(target: ChargeTarget, units: { id: string; blockId: string }[]): number {
  if (target.scope === 'site') return units.length
  if (target.scope === 'block') return units.filter((u) => u.blockId === target.block_id).length
  return target.unit_ids.length
}

// ---------------------------------------------------------------------------
// The list of charge lines: totals and search
// ---------------------------------------------------------------------------

/** Active lines count towards the total. Cancelled lines are only counted. All sums are whole kuruş. */
export function summarizeCharges(rows: { amountKurus: number; voidedAt: string | null }[]): { activeCount: number; activeKurus: number; voidedCount: number } {
  let activeCount = 0
  let activeKurus = 0
  let voidedCount = 0
  for (const row of rows) {
    if (row.voidedAt) voidedCount++
    else {
      activeCount++
      activeKurus += row.amountKurus
    }
  }
  return { activeCount, activeKurus, voidedCount }
}

/**
 * Every word of the query must be the START of a word of the line (block, door, type, description).
 * "a 3", "A BLOK 3" and "kas" all find what they should; "3" does not find door 13; Turkish İ/ı work.
 */
export function matchesChargeQuery(row: { blockName: string; doorNo: string; description: string | null; typeName: string }, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase('tr')
  if (needle === '') return true
  const words = `${row.blockName} ${row.doorNo} ${row.typeName} ${row.description ?? ''}`
    .toLocaleLowerCase('tr')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
  return needle.split(/\s+/).every((part) => words.some((word) => word.startsWith(part)))
}
