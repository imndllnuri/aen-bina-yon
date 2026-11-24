import { describe, expect, it } from 'vitest'
import type { AttendanceRow, CollectionRow, DebtRow, MonthRow, ResidentReportRow } from '../api'
import { attendanceSheet, collectionsSheet, debtsSheet, fileNameFor, formatCell, isNumeric, istanbulLocal, methodLabel, monthlySheet, residentsSheet } from './sheets'

const debt = (over: Partial<DebtRow> = {}): DebtRow => ({
  unitId: 'u1', blockName: 'A Blok', doorNo: '1', unitLabel: 'A Blok · 1', owners: 'Mehmet Malik', phone: '0532', balanceKurus: 32300,
  notDueKurus: 22000, d1to30Kurus: 300, d31to60Kurus: 1200, d61to90Kurus: 4800, over90Kurus: 4000, ...over,
})

describe('formatCell', () => {
  it('writes money, percent, dates and numbers the Turkish way', () => {
    expect(formatCell({ t: 'money', kurus: 123456 }).replace(/\u00a0/g, ' ')).toBe('₺1.234,56')
    expect(formatCell({ t: 'pct', v: 6.2 })).toBe('6,2 %')
    expect(formatCell({ t: 'pct', v: null })).toBe('—')
    expect(formatCell({ t: 'date', v: '2026-11-23' })).toBe('23.11.2026')
    expect(formatCell({ t: 'datetime', v: '2026-11-23T14:05' })).toBe('23.11.2026 14:05')
    expect(formatCell({ t: 'dec4', v: 33.3333 })).toBe('33,3333')
    expect(formatCell({ t: 'int', v: 7 })).toBe('7')
    expect(formatCell({ t: 'str', v: null })).toBe('')
    expect(formatCell({ t: 'blank' })).toBe('')
  })
  it('knows which cells are numbers (they go to the right)', () => {
    expect(isNumeric({ t: 'money', kurus: 1 })).toBe(true)
    expect(isNumeric({ t: 'pct', v: 1 })).toBe(true)
    expect(isNumeric({ t: 'str', v: 'x' })).toBe(false)
    expect(isNumeric({ t: 'date', v: '2026-01-01' })).toBe(false)
    expect(isNumeric(undefined)).toBe(false)
  })
})

describe('istanbulLocal', () => {
  it('shows the clock of Istanbul (UTC+3) for any timestamp', () => {
    expect(istanbulLocal('2026-11-23T11:05:00Z')).toBe('2026-11-23T14:05')
    expect(istanbulLocal('2026-10-31T21:30:00Z')).toBe('2026-11-01T00:30') // after midnight in Istanbul, still the 31st in UTC
    expect(istanbulLocal('2026-11-23T14:05:00+03:00')).toBe('2026-11-23T14:05')
  })
  it('gives null for a text that is no time', () => {
    expect(istanbulLocal('not a time')).toBeNull()
  })
})

describe('methodLabel', () => {
  it('names the methods, and the total', () => {
    expect(methodLabel('card')).toBe('Kart')
    expect(methodLabel('havale')).toBe('Havale / EFT')
    expect(methodLabel('cash')).toBe('Nakit')
    expect(methodLabel('pos')).toBe('POS')
    expect(methodLabel(null)).toBe('Toplam')
    expect(methodLabel('crypto')).toBe('crypto')
  })
})

describe('debtsSheet', () => {
  it('has the aging buckets and a total row that adds whole kuruş', () => {
    const sheet = debtsSheet([debt(), debt({ unitId: 'u2', unitLabel: 'A Blok · 2', owners: null, phone: null, balanceKurus: 7, notDueKurus: 7, d1to30Kurus: 0, d31to60Kurus: 0, d61to90Kurus: 0, over90Kurus: 0 })])
    expect(sheet.head).toEqual(['Daire', 'Kat maliki', 'Telefon', 'Vadesi gelmemiş', '1–30 gün', '31–60 gün', '61–90 gün', '90+ gün', 'Toplam borç'])
    expect(sheet.rows).toHaveLength(2)
    expect(sheet.rows[0]?.[8]).toEqual({ t: 'money', kurus: 32300 })
    expect(sheet.total?.[0]).toEqual({ t: 'str', v: 'Toplam (2 daire)' })
    expect(sheet.total?.[8]).toEqual({ t: 'money', kurus: 32307 })
    expect(sheet.total?.[3]).toEqual({ t: 'money', kurus: 22007 })
    expect(sheet.total?.length).toBe(sheet.head.length)
  })
  it('sums 0.07 + 0.01 style amounts without a rounding error', () => {
    const sheet = debtsSheet([debt({ balanceKurus: 7 }), debt({ balanceKurus: 1 }), debt({ balanceKurus: 10 })])
    expect(sheet.total?.[8]).toEqual({ t: 'money', kurus: 18 })
  })
  it('has no total row when nobody owes', () => {
    expect(debtsSheet([]).total).toBeUndefined()
  })
  it('puts every cell where its heading is (the same count in each row)', () => {
    const sheet = debtsSheet([debt()])
    expect(sheet.rows.every((r) => r.length === sheet.head.length)).toBe(true)
    expect(sheet.widths?.length).toBe(sheet.head.length)
  })
})

describe('collectionsSheet', () => {
  const row = (over: Partial<CollectionRow> = {}): CollectionRow => ({ paymentId: 'p1', paidAt: '2026-11-23T11:05:00Z', receiptNo: 'MKB-2026-000001', unitLabel: 'A Blok · 1', payerName: 'Mehmet', method: 'cash', amountKurus: 2400, feeKurus: 0, ...over })
  it('shows the Istanbul time, the method in words, and totals', () => {
    const sheet = collectionsSheet([row(), row({ paymentId: 'p2', method: 'card', amountKurus: 10050, feeKurus: 251 })])
    expect(sheet.rows[0]?.[0]).toEqual({ t: 'datetime', v: '2026-11-23T14:05' })
    expect(sheet.rows[1]?.[4]).toEqual({ t: 'str', v: 'Kart' })
    expect(sheet.total?.[5]).toEqual({ t: 'money', kurus: 12450 })
    expect(sheet.total?.[6]).toEqual({ t: 'money', kurus: 251 })
    expect(sheet.total?.[0]).toEqual({ t: 'str', v: 'Toplam (2 ödeme)' })
  })
  it('keeps a text that looks like a formula as text', () => {
    const sheet = collectionsSheet([row({ payerName: '=HYPERLINK("http://x","y")' })])
    expect(sheet.rows[0]?.[3]).toEqual({ t: 'str', v: '=HYPERLINK("http://x","y")' })
  })
})

describe('monthlySheet', () => {
  const m = (over: Partial<MonthRow> = {}): MonthRow => ({ month: '2026-11-01', accruedKurus: 24200, collectedKurus: 2900, collectedForMonthKurus: 1500, ratePct: 6.2, ...over })
  it('names the month, and adds the three money columns (no total of the rate)', () => {
    const sheet = monthlySheet([m(), m({ month: '2026-10-01', accruedKurus: 300, collectedKurus: 1000, collectedForMonthKurus: 0, ratePct: 0 })])
    expect(sheet.rows[0]?.[0]).toEqual({ t: 'str', v: 'Kasım 2026' })
    expect(sheet.rows[1]?.[4]).toEqual({ t: 'pct', v: 0 })
    expect(sheet.total?.[1]).toEqual({ t: 'money', kurus: 24500 })
    expect(sheet.total?.[2]).toEqual({ t: 'money', kurus: 3900 })
    expect(sheet.total?.[3]).toEqual({ t: 'money', kurus: 1500 })
    expect(sheet.total?.[4]).toEqual({ t: 'pct', v: null })
  })
})

describe('residentsSheet', () => {
  const r = (over: Partial<ResidentReportRow> = {}): ResidentReportRow => ({
    unitId: 'u1', blockName: 'A Blok', doorNo: '1', floor: 2, grossM2: 95, landShare: 100, relation: 'tenant', fullName: 'Kemal', phone: null, email: 'k@x.com', startDate: '2025-01-01', isActive: false, ...over,
  })
  it('names the relation and the account, and keeps empty cells empty', () => {
    const sheet = residentsSheet([r(), r({ relation: 'owner', isActive: true, floor: null })])
    expect(sheet.rows[0]?.[4]).toEqual({ t: 'str', v: 'Kiracı' })
    expect(sheet.rows[0]?.[9]).toEqual({ t: 'str', v: 'Pasif' })
    expect(sheet.rows[1]?.[4]).toEqual({ t: 'str', v: 'Kat maliki' })
    expect(sheet.rows[1]?.[1]).toEqual({ t: 'blank' })
    expect(sheet.rows[0]?.[8]).toEqual({ t: 'date', v: '2025-01-01' })
    expect(sheet.total).toBeUndefined()
  })
})

describe('attendanceSheet (hazirun cetveli)', () => {
  const a = (over: Partial<AttendanceRow> = {}): AttendanceRow => ({ unitId: 'u1', blockName: 'A Blok', doorNo: '1', owners: 'Mehmet Malik, Ortak Malik', landShare: 100, sharePct: 33.3333, totalLandShare: 300, unitCount: 3, ...over })
  it('numbers the rows, has an empty signature column, and shows the share the database worked out', () => {
    const sheet = attendanceSheet([a(), a({ unitId: 'u2', doorNo: '2', owners: null, landShare: 200, sharePct: 66.6667 })])
    expect(sheet.head).toEqual(['Sıra', 'Blok', 'Kapı no', 'Kat maliki', 'Arsa payı', 'Pay (%)', 'İmza'])
    expect(sheet.rows[0]?.[0]).toEqual({ t: 'int', v: 1 })
    expect(sheet.rows[1]?.[0]).toEqual({ t: 'int', v: 2 })
    expect(sheet.rows[0]?.[6]).toEqual({ t: 'blank' })
    expect(sheet.rows[0]?.[5]).toEqual({ t: 'dec4', v: 33.3333 })
  })
  it('says so for a unit without a recorded owner (it is still on the sheet)', () => {
    expect(attendanceSheet([a({ owners: null })]).rows[0]?.[3]).toEqual({ t: 'str', v: '(kayıtlı kat maliki yok)' })
  })
  it('has a total row with the number of units, the total share and 100 %', () => {
    const sheet = attendanceSheet([a()])
    expect(sheet.total?.[2]).toEqual({ t: 'str', v: '3 bağımsız bölüm' })
    expect(sheet.total?.[4]).toEqual({ t: 'dec4', v: 300 })
    expect(sheet.total?.[5]).toEqual({ t: 'dec4', v: 100 })
  })
  it('shows no 100 % when no unit has a share', () => {
    expect(attendanceSheet([a({ landShare: 0, sharePct: null, totalLandShare: 0 })]).total?.[5]).toEqual({ t: 'dec4', v: null })
  })
})

describe('fileNameFor', () => {
  it('makes a name that is safe on every system', () => {
    expect(fileNameFor('borclar', '2026-11-24')).toBe('borc-listesi-2026-11-24.xlsx')
    expect(fileNameFor('hazirun', '2026-11-24')).toBe('hazirun-cetveli-2026-11-24.xlsx')
    for (const id of ['borclar', 'tahsilat', 'aylik', 'sakinler', 'hazirun'] as const) expect(fileNameFor(id, '2026-01-01')).toMatch(/^[a-z0-9-]+\.xlsx$/)
  })
})
