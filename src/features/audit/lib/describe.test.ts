import { describe, expect, it } from 'vitest'
import { ACTION_LABEL, changedKeys, fieldLabel, formatValue, headline, summarize, tableLabel, TABLE_LABEL, type AuditLike } from './describe'

const row = (over: Partial<AuditLike>): AuditLike => ({ table: 'payments', action: 'insert', oldData: null, newData: null, ...over })
const plain = (s: string) => s.replace(/\u00a0/g, ' ')

describe('names', () => {
  it('names every audited table in Turkish (twelve of them)', () => {
    expect(Object.keys(TABLE_LABEL)).toHaveLength(12)
    expect(tableLabel('payments')).toBe('Ödeme')
    expect(tableLabel('companies')).toBe('Firma / ayarlar')
  })
  it('shows a table or field this version does not know as it is', () => {
    expect(tableLabel('from_the_future')).toBe('from_the_future')
    expect(fieldLabel('new_column')).toBe('new_column')
    expect(fieldLabel('voided_at')).toBe('İptal zamanı')
  })
  it('names the three actions', () => {
    expect(ACTION_LABEL).toEqual({ insert: 'Eklendi', update: 'Değişti', delete: 'Silindi' })
  })
})

describe('formatValue', () => {
  it('writes money as TL, yes/no, dates and times', () => {
    expect(plain(formatValue('amount', 1234.5))).toBe('₺1.234,50')
    expect(plain(formatValue('fee', 0))).toBe('₺0,00')
    expect(formatValue('active', true)).toBe('Evet')
    expect(formatValue('active', false)).toBe('Hayır')
    expect(formatValue('due_date', '2026-11-23')).toBe('23.11.2026')
    expect(formatValue('voided_at', '2026-11-23T11:05:00+00:00')).toBe('23.11.2026 14:05')
    expect(formatValue('floor', 3)).toBe('3')
    expect(formatValue('land_share', 100.5)).toBe('100,5')
  })
  it('names known words and shows the rest as it is', () => {
    expect(formatValue('status', 'voided')).toBe('İptal edildi')
    expect(formatValue('status', 'cozuldu')).toBe('Çözüldü')
    expect(formatValue('method', 'havale')).toBe('Havale / EFT')
    expect(formatValue('relation', 'owner')).toBe('Kat maliki')
    expect(formatValue('status', 'strange')).toBe('strange')
    expect(formatValue('name', 'Çatı Tamiri')).toBe('Çatı Tamiri')
  })
  it('shows nothing as a dash and an object as text, cut when it is very long', () => {
    expect(formatValue('x', null)).toBe('—')
    expect(formatValue('x', undefined)).toBe('—')
    expect(formatValue('settings', { a: 1 })).toBe('{"a":1}')
    expect(formatValue('settings', { a: 'x'.repeat(1000) })).toHaveLength(401)
  })
})

describe('summarize and headline', () => {
  it('says what a payment is', () => {
    const r = row({ newData: { receipt_no: 'MKB-2026-000012', amount: 250, unit_label: 'A Blok · 1' } })
    expect(plain(summarize(r))).toBe('MKB-2026-000012 · ₺250,00 · A Blok · 1')
    expect(headline(r)).toBe('Ödeme eklendi')
  })
  it('lists the changed fields of an update in words', () => {
    const r = row({ action: 'update', oldData: { status: 'approved', voided_at: null }, newData: { status: 'voided', voided_at: '2026-11-23T11:05:00Z' } })
    expect(summarize(r)).toBe('Değişen: Durum, İptal zamanı')
    expect(changedKeys(r)).toEqual(['status', 'voided_at'])
    expect(headline(r)).toBe('Ödeme değişti')
  })
  it('says "Ayarlar değişti" when the settings column changed and "Firma bilgileri" otherwise', () => {
    expect(summarize(row({ table: 'companies', action: 'update', oldData: { settings: {} }, newData: { settings: { a: 1 } } }))).toBe('Ayarlar değişti')
    expect(summarize(row({ table: 'companies', action: 'update', oldData: { name: 'A' }, newData: { name: 'B' } }))).toBe('Firma bilgileri değişti')
  })
  it('describes the other tables', () => {
    expect(summarize(row({ table: 'units', newData: { door_no: '12' } }))).toBe('Daire 12')
    expect(summarize(row({ table: 'units', action: 'delete', oldData: { door_no: '12' } }))).toBe('Daire 12')
    expect(summarize(row({ table: 'unit_residents', newData: { relation: 'tenant', start_date: '2026-11-01' } }))).toBe('Kiracı · başlangıç 01.11.2026')
    expect(summarize(row({ table: 'announcements', newData: { title: 'Toplantı' } }))).toBe('Toplantı')
    expect(summarize(row({ table: 'requests', newData: { title: 'Asansör' } }))).toBe('Asansör')
    expect(summarize(row({ table: 'charge_types', newData: { name: 'Çatı' } }))).toBe('Çatı')
    expect(plain(summarize(row({ table: 'charges', newData: { amount: 100, due_date: '2026-11-15' } })))).toBe('₺100,00 · son ödeme 15.11.2026')
    expect(plain(summarize(row({ table: 'transfer_notices', newData: { amount: 50, sender_name: 'Ali' } })))).toBe('₺50,00 · Ali')
    expect(plain(summarize(row({ table: 'charge_batches', newData: { total: 1000, unit_count: 16 } })))).toBe('₺1.000,00 · 16 daire')
    expect(summarize(row({ table: 'site_members', newData: { role: 'admin' } }))).toBe('Yönetici')
    expect(summarize(row({ table: 'site_members', newData: { role: 'admin', person: 'Ece Yılmaz' } }))).toBe('Yönetici: Ece Yılmaz')
    expect(summarize(row({ table: 'site_members', action: 'delete', oldData: { role: 'admin', person: 'Berk Admin' }, newData: null }))).toBe('Yönetici: Berk Admin') // a removed person is still named
    expect(summarize(row({ table: 'site_members', newData: { role: 'staff', person: 'Görevli Kişi' } }))).toBe('staff: Görevli Kişi')
    expect(fieldLabel('person')).toBe('Kişi')
  })
  it('says nothing for a table it does not know, and does not crash on empty data', () => {
    expect(summarize(row({ table: 'strange', newData: { a: 1 } }))).toBe('')
    expect(summarize(row({ table: 'payments' }))).toBe('')
    expect(summarize(row({ action: 'update' }))).toBe('')
  })
})

describe('details that were easy to get wrong', () => {
  it('shows a total (a batch) as money, like an amount and a fee', () => {
    expect(plain(formatValue('total', 1234.5))).toBe('₺1.234,50')
  })
  it('lists changed columns for an update only, never for an insert or a delete', () => {
    expect(changedKeys(row({ action: 'update', newData: { status: 'voided' } }))).toEqual(['status'])
    expect(changedKeys(row({ action: 'insert', newData: { amount: 5 } }))).toEqual([])
    expect(changedKeys(row({ action: 'delete', oldData: { amount: 5 }, newData: { amount: 5 } }))).toEqual([])
  })
})
