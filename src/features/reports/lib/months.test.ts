import { describe, expect, it } from 'vitest'
import { addMonths, dateToMonthInput, MAX_MONTHS, monthInputToDate, monthsBetween } from './months'

describe('month arithmetic', () => {
  it('adds and subtracts months across years', () => {
    expect(addMonths('2026-11-01', 0)).toBe('2026-11-01')
    expect(addMonths('2026-11-01', 2)).toBe('2027-01-01')
    expect(addMonths('2026-11-01', -11)).toBe('2025-12-01')
    expect(addMonths('2026-01-01', -1)).toBe('2025-12-01')
    expect(addMonths('2026-12-01', 1)).toBe('2027-01-01')
    expect(addMonths('2026-11-01', -59)).toBe('2021-12-01')
  })
  it('counts the months between two', () => {
    expect(monthsBetween('2026-01-01', '2026-01-01')).toBe(0)
    expect(monthsBetween('2025-12-01', '2026-11-01')).toBe(11)
    expect(monthsBetween('2026-11-01', '2025-12-01')).toBe(-11)
  })
  it('turns the value of a month box into a date and back', () => {
    expect(monthInputToDate('2026-11')).toBe('2026-11-01')
    expect(monthInputToDate('2026-13')).toBeNull()
    expect(monthInputToDate('2026-00')).toBeNull()
    expect(monthInputToDate('')).toBeNull()
    expect(monthInputToDate('2026-11-05')).toBeNull()
    expect(dateToMonthInput('2026-11-01')).toBe('2026-11')
  })
  it('knows the limit of the database (60 months)', () => {
    expect(MAX_MONTHS).toBe(60)
  })
})
