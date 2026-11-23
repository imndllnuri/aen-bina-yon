import { describe, expect, it } from 'vitest'
import { noticeStatusInfo, transferErrorMessage } from './notices'

describe('noticeStatusInfo', () => {
  it('names every state in plain Turkish', () => {
    expect(noticeStatusInfo('pending', null)).toEqual({ label: 'Onay bekliyor', tone: 'waiting' })
    expect(noticeStatusInfo('approved', 'approved')).toEqual({ label: 'Onaylandı', tone: 'good' })
    expect(noticeStatusInfo('rejected', null)).toEqual({ label: 'Reddedildi', tone: 'bad' })
    expect(noticeStatusInfo('cancelled', null)).toEqual({ label: 'Geri çekildi', tone: 'neutral' })
  })
  it('does NOT say "Onaylandı" when the payment of an approved notice was cancelled later', () => {
    expect(noticeStatusInfo('approved', 'voided')).toEqual({ label: 'Ödeme iptal edildi', tone: 'bad' })
  })
  it('treats an approved notice whose payment cannot be read as approved (the payment row may be hidden)', () => {
    expect(noticeStatusInfo('approved', null).label).toBe('Onaylandı')
  })
})

describe('transferErrorMessage', () => {
  const codes = [
    'amount_invalid', 'date_invalid', 'sender_invalid', 'note_invalid', 'file_invalid', 'file_used', 'too_many_pending', 'not_pending',
    'reason_invalid', 'method_invalid', 'payer_invalid', 'payer_name_invalid', 'charges_invalid', 'charge_not_payable', 'already_paid',
    'no_open_lines', 'amount_exceeds_debt', 'iban_invalid', 'accounts_invalid',
  ]
  it('has its own Turkish sentence for every code the database can send', () => {
    const generic = transferErrorMessage(new Error('something else'))
    const seen = new Set<string>()
    for (const code of codes) {
      const message = transferErrorMessage({ message: code })
      expect(message, code).not.toBe(generic)
      expect(message, code).not.toContain(code)
      seen.add(message)
    }
    expect(seen.size).toBe(codes.length)
  })
  it('explains the "no credit yet" rule', () => {
    expect(transferErrorMessage({ message: 'amount_exceeds_debt' })).toMatch(/Fazla ödeme \(alacak\) henüz desteklenmiyor/)
  })
  it('answers permission and storage problems in plain words, and anything unknown generically', () => {
    expect(transferErrorMessage({ code: '42501', message: 'x' })).toBe('Bu işlem için yetkiniz yok.')
    expect(transferErrorMessage({ statusCode: '413', message: 'x' })).toMatch(/5 MB/)
    expect(transferErrorMessage({ statusCode: 415, message: 'x' })).toMatch(/PDF, JPG veya PNG/)
    expect(transferErrorMessage(null)).toMatch(/şu anda yapılamadı/)
    expect(transferErrorMessage({ message: 'request_id_used' })).toMatch(/şu anda yapılamadı/)
  })
})
