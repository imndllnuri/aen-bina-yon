import { describe, expect, it } from 'vitest'
import {
  asCategory,
  asPriority,
  canRate,
  categoryLabel,
  CATEGORIES,
  eventText,
  isOpenStatus,
  priorityLabel,
  requestErrorMessage,
  slaInfo,
  SLA_HOURS,
  statusLabel,
  statusTone,
  stepsFor,
} from './catalog'

describe('labels', () => {
  it('names every category, priority and status in Turkish', () => {
    expect(CATEGORIES).toHaveLength(11)
    expect(categoryLabel('su_tesisati')).toBe('Su Tesisatı')
    expect(categoryLabel('isinma')).toBe('Isınma / Doğalgaz')
    expect(priorityLabel('yuksek')).toBe('Yüksek')
    expect(statusLabel('inceleniyor')).toBe('İnceleniyor')
    expect(statusLabel('iptal')).toBe('İptal edildi')
  })

  it('shows a code it does not know as it is, never as a blank (a newer server)', () => {
    expect(categoryLabel('from_the_future')).toBe('from_the_future')
    expect(priorityLabel('x')).toBe('x')
    expect(statusLabel('y')).toBe('y')
  })

  it('turns an unknown code into a safe form value', () => {
    expect(asCategory('elektrik')).toBe('elektrik')
    expect(asCategory('nope')).toBe('diger')
    expect(asPriority('acil')).toBe('acil')
    expect(asPriority('nope')).toBe('normal')
  })
})

describe('status rules', () => {
  it('knows which statuses are open and which can be rated', () => {
    expect(['acik', 'inceleniyor', 'islemde'].every(isOpenStatus)).toBe(true)
    expect(['cozuldu', 'kapandi', 'iptal'].some(isOpenStatus)).toBe(false)
    expect(canRate('cozuldu')).toBe(true)
    expect(canRate('kapandi')).toBe(true)
    expect(canRate('islemde')).toBe(false)
    expect(canRate('iptal')).toBe(false)
  })

  it('gives each status a badge tone', () => {
    expect(statusTone('acik')).toBe('waiting')
    expect(statusTone('islemde')).toBe('working')
    expect(statusTone('cozuldu')).toBe('good')
    expect(statusTone('kapandi')).toBe('neutral')
    expect(statusTone('iptal')).toBe('bad')
  })
})

describe('slaInfo (the "taking too long" badge)', () => {
  const created = '2026-11-20T09:00:00Z'
  const at = (iso: string) => new Date(iso)

  it('says how much time is left for an open request', () => {
    // normal = 7 days; 2 days passed -> 5 days left
    expect(slaInfo({ status: 'acik', priority: 'normal', createdAt: created }, at('2026-11-22T09:00:00Z'))).toEqual({ late: false, label: '5 gün kaldı' })
  })

  it('counts in hours when less than a day is left', () => {
    // acil = 24 h; 20 h passed -> 4 h left
    expect(slaInfo({ status: 'islemde', priority: 'acil', createdAt: created }, at('2026-11-21T05:00:00Z'))).toEqual({ late: false, label: '4 saat kaldı' })
  })

  it('says late once the time is over', () => {
    // yuksek = 72 h; 5 days passed -> 2 days late
    expect(slaInfo({ status: 'inceleniyor', priority: 'yuksek', createdAt: created }, at('2026-11-25T09:00:00Z'))).toEqual({ late: true, label: '2 gün gecikti' })
    // one hour late is "1 saat gecikti", not "0"
    expect(slaInfo({ status: 'acik', priority: 'acil', createdAt: created }, at('2026-11-21T10:00:00Z'))).toEqual({ late: true, label: '1 saat gecikti' })
  })

  it('is exactly on time at the limit (not late yet)', () => {
    const now = new Date(new Date(created).getTime() + SLA_HOURS.normal * 3_600_000)
    expect(slaInfo({ status: 'acik', priority: 'normal', createdAt: created }, now)?.late).toBe(false)
  })

  it('has a longer time for a lower priority', () => {
    expect(SLA_HOURS.acil).toBeLessThan(SLA_HOURS.yuksek)
    expect(SLA_HOURS.yuksek).toBeLessThan(SLA_HOURS.normal)
    expect(SLA_HOURS.normal).toBeLessThan(SLA_HOURS.dusuk)
  })

  it('shows nothing for a request that is solved, closed or cancelled', () => {
    for (const status of ['cozuldu', 'kapandi', 'iptal']) expect(slaInfo({ status, priority: 'acil', createdAt: created }, at('2030-01-01T00:00:00Z'))).toBeNull()
  })

  it('treats an unknown priority like a normal one', () => {
    expect(slaInfo({ status: 'acik', priority: 'x', createdAt: created }, at('2026-11-22T09:00:00Z'))?.label).toBe('5 gün kaldı')
  })
})

describe('the five steps', () => {
  it('marks done, current and not yet', () => {
    expect(stepsFor('islemde')?.map((s) => `${s.code}:${s.state}`)).toEqual(['acik:done', 'inceleniyor:done', 'islemde:current', 'cozuldu:todo', 'kapandi:todo'])
    expect(stepsFor('acik')?.map((s) => s.state)).toEqual(['current', 'todo', 'todo', 'todo', 'todo'])
    expect(stepsFor('kapandi')?.map((s) => s.state)).toEqual(['done', 'done', 'done', 'done', 'current'])
  })

  it('has no steps for a cancelled request', () => {
    expect(stepsFor('iptal')).toBeNull()
  })
})

describe('eventText (the history in words)', () => {
  const ev = (over: object) => ({ kind: 'status', fromStatus: null, toStatus: null, rating: null, ...over })
  it('says what happened', () => {
    expect(eventText(ev({ kind: 'created', toStatus: 'acik' }))).toBe('Talep açıldı')
    expect(eventText(ev({ fromStatus: 'acik', toStatus: 'inceleniyor' }))).toBe('Durum: İnceleniyor')
    expect(eventText(ev({ kind: 'rated', rating: 4 }))).toBe('Çözüm değerlendirildi: 4/5')
    expect(eventText(ev({ fromStatus: 'acik', toStatus: 'iptal' }))).toBe('Talep iptal edildi')
  })

  it('calls a move from solved or closed back to an open step "reopened"', () => {
    expect(eventText(ev({ fromStatus: 'cozuldu', toStatus: 'inceleniyor' }))).toBe('Talep yeniden açıldı (İnceleniyor)')
    expect(eventText(ev({ fromStatus: 'kapandi', toStatus: 'acik' }))).toBe('Talep yeniden açıldı (Açık)')
    // solved -> closed is a normal step, not a reopening
    expect(eventText(ev({ fromStatus: 'cozuldu', toStatus: 'kapandi' }))).toBe('Durum: Kapandı')
  })
})

describe('requestErrorMessage', () => {
  const codes = [
    'category_invalid', 'title_invalid', 'description_invalid', 'priority_invalid', 'location_invalid', 'too_many_photos', 'photo_invalid', 'photo_used',
    'too_many_open', 'requester_invalid', 'not_open', 'request_closed', 'request_cancelled', 'status_same', 'status_invalid', 'body_invalid', 'not_resolved',
    'already_rated', 'rating_invalid',
  ]
  it('has its own Turkish sentence for every code the database can raise', () => {
    const messages = codes.map((message) => requestErrorMessage({ message }))
    expect(new Set(messages).size).toBe(codes.length) // all different
    for (const text of messages) expect(text).not.toMatch(/_/) // no raw code shown
  })

  it('explains the rule behind "not_open" and "too_many_open"', () => {
    expect(requestErrorMessage({ message: 'not_open' })).toMatch(/yönetim ilgilenmeye başladı/)
    expect(requestErrorMessage({ message: 'too_many_open' })).toMatch(/10 açık talep/)
  })

  it('says "no permission" for a refusal, and something calm for anything else', () => {
    expect(requestErrorMessage({ message: 'not allowed', code: '42501' })).toBe('Bu işlem için yetkiniz yok.')
    expect(requestErrorMessage({ code: '42501' })).toBe('Bu işlem için yetkiniz yok.')
    for (const odd of [null, undefined, {}, { message: 'token_used' }, { message: 'boom' }, 'text']) expect(requestErrorMessage(odd)).toMatch(/şu anda yapılamadı/)
  })

  it('understands a refusal of the file store (a photo that is too big or of a wrong type)', () => {
    expect(requestErrorMessage({ message: 'The object exceeded the maximum allowed size' })).toMatch(/çok büyük/)
    expect(requestErrorMessage({ message: 'mime type image/gif is not supported' })).toMatch(/JPG, PNG veya WEBP/)
  })
})
