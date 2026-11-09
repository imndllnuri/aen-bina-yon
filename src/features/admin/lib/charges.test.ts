import { describe, expect, it } from 'vitest'
import {
  canDeleteBatch,
  chargeErrorMessage,
  chargeStatus,
  currentMonthIstanbul,
  describeTarget,
  dueDateFor,
  isSplitMethod,
  isTargetComplete,
  matchesChargeQuery,
  monthLabel,
  monthOptions,
  SPLIT_LABELS,
  SPLIT_METHODS,
  summarizeCharges,
  targetUnitCount,
} from './charges'

describe('split methods', () => {
  it('has a label and an amount label for every method the database knows', () => {
    expect(SPLIT_METHODS.map((m) => m.value).sort()).toEqual(['equal', 'gross_m2', 'land_share', 'per_unit'])
    expect(Object.keys(SPLIT_LABELS).sort()).toEqual(['equal', 'gross_m2', 'land_share', 'per_unit'])
  })

  it('says clearly whether the amount is per unit or a total to share', () => {
    expect(SPLIT_METHODS.find((m) => m.value === 'per_unit')!.amountLabel).toBe('Her dairenin tutarı')
    for (const m of SPLIT_METHODS.filter((m) => m.value !== 'per_unit')) expect(m.amountLabel).toBe('Paylaştırılacak toplam tutar')
  })

  it('recognises a split method', () => {
    expect(isSplitMethod('equal')).toBe(true)
    expect(isSplitMethod('bogus')).toBe(false)
    expect(isSplitMethod('toString')).toBe(false)
  })
})

describe('describeTarget', () => {
  const blocks = { b1: 'A Blok' }
  it('names the target in words', () => {
    expect(describeTarget({ scope: 'site' }, blocks)).toBe('Tüm site')
    expect(describeTarget({ scope: 'block', block_id: 'b1' }, blocks)).toBe('A Blok')
    expect(describeTarget({ scope: 'block', block_id: 'gone' }, blocks)).toBe('Blok')
    expect(describeTarget({ scope: 'units', unit_ids: ['x', 'y', 'z'] }, blocks)).toBe('3 daire')
    expect(describeTarget(null, blocks)).toBe('—')
  })
})

describe('months', () => {
  it('writes a month in Turkish', () => {
    expect(monthLabel('2026-11-01')).toBe('Kasım 2026')
    expect(monthLabel('2027-01-01')).toBe('Ocak 2027')
  })

  it('uses the Istanbul month: 00:30 on 1 December in Istanbul is December although UTC is still November', () => {
    expect(currentMonthIstanbul(new Date('2026-11-30T21:30:00Z'))).toBe('2026-12-01')
    expect(currentMonthIstanbul(new Date('2026-11-30T20:59:59Z'))).toBe('2026-11-01')
  })

  it('lists months newest first, around the current one', () => {
    const options = monthOptions(new Date('2026-11-09T12:00:00Z'), 12, 2)
    expect(options).toHaveLength(15)
    expect(options[0]).toEqual({ value: '2027-01-01', label: 'Ocak 2027' })
    expect(options[2]).toEqual({ value: '2026-11-01', label: 'Kasım 2026' })
    expect(options.at(-1)).toEqual({ value: '2025-11-01', label: 'Kasım 2025' })
  })

  it('crosses the New Year correctly', () => {
    const options = monthOptions(new Date('2026-01-15T12:00:00Z'), 2, 1)
    expect(options.map((o) => o.value)).toEqual(['2026-02-01', '2026-01-01', '2025-12-01', '2025-11-01'])
  })

  it('gives a plan the due date of a month', () => {
    expect(dueDateFor('2026-11-01', 5)).toBe('2026-11-05')
    expect(dueDateFor('2026-11-01', 28)).toBe('2026-11-28')
  })
})

describe('chargeStatus', () => {
  const line = (due_date: string, voided_at: string | null = null) => ({ due_date, voided_at })
  it('is open until the due date has passed', () => {
    expect(chargeStatus(line('2026-11-30'), '2026-11-09')).toBe('open')
    expect(chargeStatus(line('2026-11-09'), '2026-11-09')).toBe('open')
    expect(chargeStatus(line('2026-11-08'), '2026-11-09')).toBe('overdue')
  })
  it('is cancelled whatever the date', () => {
    expect(chargeStatus(line('2020-01-01', '2026-11-01T10:00:00Z'), '2026-11-09')).toBe('voided')
  })
})

describe('canDeleteBatch (15 minutes)', () => {
  const now = new Date('2026-11-09T12:00:00Z')
  it('allows a fresh batch and refuses an old one', () => {
    expect(canDeleteBatch('2026-11-09T11:50:00Z', now)).toBe(true)
    expect(canDeleteBatch('2026-11-09T11:45:01Z', now)).toBe(true)
    expect(canDeleteBatch('2026-11-09T11:45:00Z', now)).toBe(false)
    expect(canDeleteBatch('2026-11-09T11:00:00Z', now)).toBe(false)
  })
})

describe('chargeErrorMessage', () => {
  const dbError = (message: string, details: string | null = null, code = 'P0001') => ({ message, details, code })

  it('names the units that have no arsa payı or m²', () => {
    expect(chargeErrorMessage(dbError('missing_weight', 'A Blok 3, B Blok 9'), { split: 'land_share' })).toBe(
      'Şu dairelerde arsa payı yazılı değil: A Blok 3, B Blok 9. Önce Daireler sayfasından doldurun ya da başka bir paylaştırma yöntemi seçin.',
    )
    expect(chargeErrorMessage(dbError('missing_weight', 'A Blok 3'), { split: 'gross_m2' })).toContain('brüt m² yazılı değil: A Blok 3')
  })

  it('explains the aidat increase rule with the YDO from the database', () => {
    const message = chargeErrorMessage(dbError('karar_required', '25.49'))
    expect(message).toContain('%25.49')
    expect(message).toContain('karar numarasını ve tarihini')
  })

  it('names the unit whose share would be 0,00', () => {
    expect(chargeErrorMessage(dbError('amount_too_small', 'A Blok 2'))).toContain('A Blok 2 dairesine 0,00 ₺ düşüyor')
    expect(chargeErrorMessage(dbError('amount_too_small'))).toContain('bazı dairelere 0,00 ₺ düşüyor')
  })

  it('has a Turkish sentence for every code the database can raise', () => {
    const codes = [
      'target_invalid', 'no_units', 'split_invalid', 'amount_invalid', 'amount_too_small', 'missing_weight', 'preview_outdated',
      'charge_type_invalid', 'period_invalid', 'due_date_invalid', 'description_invalid', 'karar_invalid', 'karar_required',
      'already_generated', 'plan_inactive', 'name_invalid', 'day_invalid', 'reason_invalid', 'already_voided',
      'delete_window_closed', 'charge_voided',
    ]
    for (const code of codes) {
      const message = chargeErrorMessage(dbError(code))
      expect(message, code).not.toBe('İşlem şu anda yapılamadı. Lütfen biraz sonra tekrar deneyin.')
      expect(message, code).not.toContain(code)
    }
  })

  it('never shows raw database text', () => {
    const message = chargeErrorMessage({ message: 'duplicate key value violates unique constraint "x"', code: '23505' })
    expect(message).toBe('İşlem şu anda yapılamadı. Lütfen biraz sonra tekrar deneyin.')
    expect(chargeErrorMessage(new TypeError('Failed to fetch'))).toBe('İşlem şu anda yapılamadı. Lütfen biraz sonra tekrar deneyin.')
    expect(chargeErrorMessage(null)).toContain('yapılamadı')
  })

  it('maps permission and check errors', () => {
    expect(chargeErrorMessage({ message: 'not allowed', code: '42501' })).toBe('Bu işlem için yetkiniz yok.')
    expect(chargeErrorMessage({ message: 'new row violates check constraint', code: '23514' })).toContain('geçersiz')
  })
})

describe('summarizeCharges', () => {
  it('adds only the active lines, in whole kuruş', () => {
    const rows = [
      { amountKurus: 10, voidedAt: null },
      { amountKurus: 10, voidedAt: null },
      { amountKurus: 10, voidedAt: null },
      { amountKurus: 99999, voidedAt: '2026-11-01T10:00:00Z' },
    ]
    expect(summarizeCharges(rows)).toEqual({ activeCount: 3, activeKurus: 30, voidedCount: 1 })
    expect(summarizeCharges([])).toEqual({ activeCount: 0, activeKurus: 0, voidedCount: 0 })
  })
})

describe('matchesChargeQuery', () => {
  const row = { blockName: 'A Blok', doorNo: '3', description: 'Kasım aidatı', typeName: 'Aidat' }
  it('finds by the start of a word of block, door, type or description, any case', () => {
    expect(matchesChargeQuery(row, '')).toBe(true)
    expect(matchesChargeQuery(row, 'a 3')).toBe(true)
    expect(matchesChargeQuery(row, 'A BLOK')).toBe(true)
    expect(matchesChargeQuery(row, 'kas')).toBe(true)
    expect(matchesChargeQuery(row, 'KASIM')).toBe(true)
    expect(matchesChargeQuery(row, 'aidat')).toBe(true)
  })
  it('does not match the middle of a word or another door', () => {
    expect(matchesChargeQuery(row, 'ida')).toBe(false)
    expect(matchesChargeQuery(row, 'yakıt')).toBe(false)
    expect(matchesChargeQuery(row, 'C Blok')).toBe(false)
    expect(matchesChargeQuery(row, '4')).toBe(false)
    expect(matchesChargeQuery({ ...row, doorNo: '13' }, '3')).toBe(false)
    expect(matchesChargeQuery({ ...row, doorNo: '13' }, '13')).toBe(true)
    expect(matchesChargeQuery({ ...row, description: null }, 'kasım')).toBe(false)
  })
  it('handles Turkish capital İ and dotless ı', () => {
    expect(matchesChargeQuery({ ...row, description: 'İçme suyu' }, 'içme')).toBe(true)
    expect(matchesChargeQuery({ ...row, description: 'Isıtma' }, 'ısıtma')).toBe(true)
    expect(matchesChargeQuery({ ...row, description: 'ISITMA' }, 'ısıtma')).toBe(true)
  })
})

describe('target helpers', () => {
  const units = [
    { id: 'u1', blockId: 'b1' },
    { id: 'u2', blockId: 'b1' },
    { id: 'u3', blockId: 'b2' },
  ]
  it('counts the units of a target', () => {
    expect(targetUnitCount({ scope: 'site' }, units)).toBe(3)
    expect(targetUnitCount({ scope: 'block', block_id: 'b1' }, units)).toBe(2)
    expect(targetUnitCount({ scope: 'block', block_id: 'none' }, units)).toBe(0)
    expect(targetUnitCount({ scope: 'units', unit_ids: ['u1', 'u3'] }, units)).toBe(2)
  })
  it('knows when a target is not complete yet', () => {
    expect(isTargetComplete({ scope: 'site' })).toBe(true)
    expect(isTargetComplete({ scope: 'block', block_id: 'b1' })).toBe(true)
    expect(isTargetComplete({ scope: 'block', block_id: '' })).toBe(false)
    expect(isTargetComplete({ scope: 'units', unit_ids: [] })).toBe(false)
    expect(isTargetComplete({ scope: 'units', unit_ids: ['u1'] })).toBe(true)
  })
})
