// Words and rules for requests (talepler / arıza). Pure functions: easy to test.
// The database repeats the lists (migration 0008). The codes are plain ASCII; people read the Turkish labels.

export const CATEGORIES = [
  { code: 'elektrik', label: 'Elektrik' },
  { code: 'su_tesisati', label: 'Su Tesisatı' },
  { code: 'asansor', label: 'Asansör' },
  { code: 'isinma', label: 'Isınma / Doğalgaz' },
  { code: 'temizlik', label: 'Temizlik' },
  { code: 'guvenlik', label: 'Güvenlik' },
  { code: 'otopark', label: 'Otopark' },
  { code: 'bahce', label: 'Bahçe / Peyzaj' },
  { code: 'oneri', label: 'Öneri' },
  { code: 'sikayet', label: 'Şikayet' },
  { code: 'diger', label: 'Diğer' },
] as const
export type Category = (typeof CATEGORIES)[number]['code']
export const CATEGORY_CODES = CATEGORIES.map((c) => c.code) as [Category, ...Category[]]

export const PRIORITIES = [
  { code: 'dusuk', label: 'Düşük' },
  { code: 'normal', label: 'Normal' },
  { code: 'yuksek', label: 'Yüksek' },
  { code: 'acil', label: 'Acil' },
] as const
export type Priority = (typeof PRIORITIES)[number]['code']
export const PRIORITY_CODES = PRIORITIES.map((p) => p.code) as [Priority, ...Priority[]]

/** The steps a request walks through (plan: Açık → İnceleniyor → İşlemde → Çözüldü → Kapandı). "iptal" is a side road. */
export const STEPS = [
  { code: 'acik', label: 'Açık' },
  { code: 'inceleniyor', label: 'İnceleniyor' },
  { code: 'islemde', label: 'İşlemde' },
  { code: 'cozuldu', label: 'Çözüldü' },
  { code: 'kapandi', label: 'Kapandı' },
] as const
export type Step = (typeof STEPS)[number]['code']
export type Status = Step | 'iptal'

export const OPEN_STATUSES: readonly Status[] = ['acik', 'inceleniyor', 'islemde']
export const DONE_STATUSES: readonly Status[] = ['cozuldu', 'kapandi', 'iptal']
export const isOpenStatus = (status: string): boolean => OPEN_STATUSES.includes(status as Status)
/** A person can rate the solution once the request is solved or closed. */
export const canRate = (status: string): boolean => status === 'cozuldu' || status === 'kapandi'

export const MAX_PHOTOS = 3

/** A code from the server turned into a value the form knows (an unknown one falls back to the plain choice). */
export const asCategory = (code: string): Category => ((CATEGORY_CODES as readonly string[]).includes(code) ? (code as Category) : 'diger')
export const asPriority = (code: string): Priority => ((PRIORITY_CODES as readonly string[]).includes(code) ? (code as Priority) : 'normal')

const label = (list: readonly { code: string; label: string }[], code: string, fallback: string) => list.find((item) => item.code === code)?.label ?? fallback
/** A code this version does not know (a newer server) is shown as it is, never as a blank. */
export const categoryLabel = (code: string) => label(CATEGORIES, code, code)
export const priorityLabel = (code: string) => label(PRIORITIES, code, code)
export const statusLabel = (code: string) => (code === 'iptal' ? 'İptal edildi' : label(STEPS, code, code))

/** Which badge colour a status gets. */
export function statusTone(status: string): 'waiting' | 'working' | 'good' | 'neutral' | 'bad' {
  switch (status) {
    case 'acik':
      return 'waiting'
    case 'inceleniyor':
    case 'islemde':
      return 'working'
    case 'cozuldu':
      return 'good'
    case 'iptal':
      return 'bad'
    default:
      return 'neutral'
  }
}

// ---------------------------------------------------------------------------
// The SLA badge ("is it taking too long?"). Computed here, in the browser, from the age of the request: a simple default
// that a later slice can replace with company settings. Only requests that are still open can be late.
// ---------------------------------------------------------------------------
const HOUR = 3_600_000
/** Hours a request of this priority may stay open before it is called late. */
export const SLA_HOURS: Record<Priority, number> = { acil: 24, yuksek: 72, normal: 168, dusuk: 336 }

export interface SlaInfo {
  late: boolean
  /** "2 gün kaldı" / "1 gün gecikti" */
  label: string
}

export function slaInfo(request: { status: string; priority: string; createdAt: string }, now: Date = new Date()): SlaInfo | null {
  if (!isOpenStatus(request.status)) return null
  const allowed = (SLA_HOURS[request.priority as Priority] ?? SLA_HOURS.normal) * HOUR
  const left = new Date(request.createdAt).getTime() + allowed - now.getTime()
  const abs = Math.abs(left)
  const days = Math.floor(abs / (24 * HOUR))
  const hours = Math.max(1, Math.floor(abs / HOUR))
  const span = days >= 1 ? `${days} gün` : `${hours} saat`
  return left < 0 ? { late: true, label: `${span} gecikti` } : { late: false, label: `${span} kaldı` }
}

// ---------------------------------------------------------------------------
// The timeline
// ---------------------------------------------------------------------------
export interface StepView {
  code: Step
  label: string
  state: 'done' | 'current' | 'todo'
}

/** The five steps with where the request is now. A cancelled request has no progress to show. */
export function stepsFor(status: string): StepView[] | null {
  if (status === 'iptal') return null
  const index = STEPS.findIndex((step) => step.code === status)
  return STEPS.map((step, i) => ({ code: step.code, label: step.label, state: i < index ? 'done' : i === index ? 'current' : 'todo' }))
}

export interface EventLike {
  kind: string
  fromStatus: string | null
  toStatus: string | null
  rating: number | null
}

/** One line of the history, in words. */
export function eventText(event: EventLike): string {
  if (event.kind === 'created') return 'Talep açıldı'
  if (event.kind === 'rated') return `Çözüm değerlendirildi: ${event.rating ?? '?'}/5`
  const to = event.toStatus ?? ''
  const reopened = (event.fromStatus === 'cozuldu' || event.fromStatus === 'kapandi') && isOpenStatus(to)
  if (reopened) return `Talep yeniden açıldı (${statusLabel(to)})`
  if (to === 'iptal') return 'Talep iptal edildi'
  return `Durum: ${statusLabel(to)}`
}

// ---------------------------------------------------------------------------
// Errors: the database answers with short codes; people read Turkish.
// ---------------------------------------------------------------------------
const GENERIC = 'İşlem şu anda yapılamadı. Lütfen biraz sonra tekrar deneyin.'

type DbError = { message?: string; code?: string } | null | undefined

export function requestErrorMessage(error: unknown): string {
  const e = error as DbError
  switch (e?.message) {
    case 'category_invalid':
      return 'Kategori seçin.'
    case 'title_invalid':
      return 'Başlık en az 3, en fazla 120 karakter olmalı.'
    case 'description_invalid':
      return 'Açıklama en az 3, en fazla 2000 karakter olmalı.'
    case 'priority_invalid':
      return 'Öncelik seçin.'
    case 'location_invalid':
      return 'Konum en fazla 120 karakter olabilir.'
    case 'too_many_photos':
      return 'En fazla 3 fotoğraf ekleyebilirsiniz.'
    case 'photo_invalid':
      return 'Fotoğraflardan biri yüklenemedi ya da bu daireye ait değil. Fotoğrafları yeniden seçip tekrar deneyin.'
    case 'photo_used':
      return 'Fotoğraflardan biri başka bir talepte kullanılmış. Fotoğrafları yeniden seçin.'
    case 'too_many_open':
      return 'Bu daire için 10 açık talep var. Yenisini açmak için önce birinin tamamlanmasını bekleyin ya da bir talebi iptal edin.'
    case 'requester_invalid':
      return 'Talep sahibi bu dairede oturmuyor. Başka bir kişi seçin.'
    case 'not_open':
      return 'Bu talep artık “Açık” değil: yönetim ilgilenmeye başladı. Değiştirilemez ya da iptal edilemez. Yorum yazabilirsiniz.'
    case 'request_closed':
      return 'Bu talep kapandı ya da iptal edildi; yeni yorum yazılamaz. Yeni bir talep açabilirsiniz.'
    case 'request_cancelled':
      return 'Bu talep iptal edilmiş; değiştirilemez.'
    case 'status_same':
      return 'Talep zaten bu durumda.'
    case 'status_invalid':
      return 'Durum seçin.'
    case 'body_invalid':
      return 'Yorum 1 ile 2000 karakter arasında olmalı.'
    case 'not_resolved':
      return 'Talep çözülmeden değerlendirilemez.'
    case 'already_rated':
      return 'Bu çözümü zaten değerlendirdiniz.'
    case 'rating_invalid':
      return '1 ile 5 arasında bir puan seçin.'
    case 'token_used':
    case 'invalid_request':
      return GENERIC
  }
  if (e?.code === '42501' || e?.message === 'not allowed') return 'Bu işlem için yetkiniz yok.'
  // A refusal from the file store (the photo upload), not from the database.
  if (/exceeded the maximum|too large|payload|413/i.test(e?.message ?? '')) return 'Fotoğraf çok büyük. Daha küçük bir fotoğraf seçin.'
  if (/mime type|not supported|invalid.*type/i.test(e?.message ?? '')) return 'Bu fotoğraf türü kabul edilmiyor. JPG, PNG veya WEBP kullanın.'
  return GENERIC
}
