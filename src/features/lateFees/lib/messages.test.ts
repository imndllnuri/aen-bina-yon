import { describe, expect, it } from 'vitest'
import { lateFeeErrorMessage } from './messages'

describe('lateFeeErrorMessage', () => {
  it('says that numbers changed and that nothing was written (preview_outdated)', () => {
    const text = lateFeeErrorMessage({ message: 'preview_outdated' })
    expect(text).toMatch(/rakamlar değişti/)
    expect(text).toMatch(/Hiçbir şey yazılmadı/)
  })
  it('says there is nothing left to write (nothing_to_charge)', () => expect(lateFeeErrorMessage({ message: 'nothing_to_charge' })).toMatch(/kalmadı/))
  it('tells where to switch the fee type on (late_fee_type_missing)', () => {
    const text = lateFeeErrorMessage({ message: 'late_fee_type_missing' })
    expect(text).toMatch(/Gecikme Tazminatı/)
    expect(text).toMatch(/Ayarlar/)
  })
  it('tells about the 10 million limit (amount_too_large)', () => expect(lateFeeErrorMessage({ message: 'amount_too_large' })).toMatch(/10\.000\.000/))
  it('says "no permission" for a refusal', () => {
    expect(lateFeeErrorMessage({ code: '42501', message: 'not allowed' })).toBe('Bu işlem için yetkiniz yok.')
    expect(lateFeeErrorMessage({ message: 'not allowed' })).toBe('Bu işlem için yetkiniz yok.')
  })
  it('gives a plain sentence for everything else and never shows a code', () => {
    for (const e of [{ message: 'request_id_used' }, { message: 'invalid_request' }, { message: 'zzz' }, new Error('boom'), null, undefined]) {
      expect(lateFeeErrorMessage(e)).toBe('İşlem şu anda yapılamadı. Lütfen biraz sonra tekrar deneyin.')
    }
  })
})
