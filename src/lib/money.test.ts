import { describe, expect, it } from 'vitest'
import { formatKurus, MAX_KURUS, moneyProblemMessage, parseTryAmount, sumKurus, toKurus, type MoneyProblem } from './money'

const kurus = (text: string) => {
  const result = parseTryAmount(text)
  return result.ok ? result.kurus : result.reason
}

describe('parseTryAmount: what people type', () => {
  it('reads whole numbers', () => {
    expect(kurus('1500')).toBe(150000)
    expect(kurus('7')).toBe(700)
    expect(kurus('  12 ')).toBe(1200)
  })

  it('reads kuruş after a comma', () => {
    expect(kurus('1500,50')).toBe(150050)
    expect(kurus('0,5')).toBe(50)
    expect(kurus('0,05')).toBe(5)
    expect(kurus('12,00')).toBe(1200)
  })

  it('reads the Turkish thousands dot: 1.500 is fifteen hundred, NOT 1,5', () => {
    expect(kurus('1.500')).toBe(150000)
    expect(kurus('10.000')).toBe(1000000)
    expect(kurus('1.500,50')).toBe(150050)
    expect(kurus('1.234.567,89')).toBe(123456789)
    expect(kurus('12.345.678,90')).toBe('too_big')
    expect(kurus('9.999.999,99')).toBe(MAX_KURUS)
  })

  it('ignores the currency sign and spaces', () => {
    expect(kurus('₺1.500,00')).toBe(150000)
    expect(kurus('1.500 TL')).toBe(150000)
    expect(kurus('1 500')).toBe(150000)
  })

  it('ignores leading zeros', () => {
    expect(kurus('007,50')).toBe(750)
  })
})

describe('parseTryAmount: what it refuses', () => {
  const cases: [string, MoneyProblem][] = [
    ['', 'empty'],
    ['   ', 'empty'],
    ['1.5', 'ambiguous_dot'],
    ['1500.50', 'ambiguous_dot'],
    ['1.50', 'ambiguous_dot'],
    ['1..500', 'ambiguous_dot'],
    ['12.34.567', 'ambiguous_dot'],
    ['1,555', 'decimals'],
    ['9.999.999,995', 'decimals'],
    ['abc', 'format'],
    ['-5', 'format'],
    ['1,2,3', 'format'],
    [',50', 'format'],
    ['1,5a', 'format'],
    ['0', 'zero'],
    ['0,00', 'zero'],
    ['10.000.000', 'too_big'],
    ['99999999999999999999', 'too_big'],
  ]
  for (const [text, reason] of cases) {
    it(`"${text}" -> ${reason}`, () => {
      expect(parseTryAmount(text)).toEqual({ ok: false, reason })
    })
  }

  it('has a Turkish message for every problem', () => {
    const problems: MoneyProblem[] = ['empty', 'format', 'ambiguous_dot', 'decimals', 'zero', 'too_big']
    for (const problem of problems) expect(moneyProblemMessage(problem).length).toBeGreaterThan(5)
  })
})

describe('parseTryAmount: round trip', () => {
  const plain = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  it('reads back what the app shows, for 20.000 amounts spread over the whole range', () => {
    // A simple repeatable pseudo random sequence (no randomness: the test must not flake).
    let seed = 12345
    const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648)
    for (let i = 0; i < 20000; i++) {
      const value = 1 + (next() % MAX_KURUS)
      const shown = plain.format(value / 100)
      const result = parseTryAmount(shown)
      expect(result, shown).toEqual({ ok: true, kurus: value })
    }
  })

  it('reads back every amount around the grouping edges', () => {
    for (const value of [1, 99, 100, 99999, 100000, 100001, 99999999, 100000000, 100000001, MAX_KURUS]) {
      expect(parseTryAmount(plain.format(value / 100))).toEqual({ ok: true, kurus: value })
    }
  })
})

describe('kuruş helpers', () => {
  it('shows kuruş as lira', () => {
    // Intl may put a no-break space after the sign in some versions, so compare without spaces.
    expect(formatKurus(150000).replace(/\s/g, '')).toBe('₺1.500,00')
    expect(formatKurus(5).replace(/\s/g, '')).toBe('₺0,05')
  })

  it('turns database amounts into whole kuruş without float drift', () => {
    expect(toKurus(696.9)).toBe(69690)
    expect(toKurus(0.1 + 0.2)).toBe(30)
    expect(toKurus(1234567.89)).toBe(123456789)
    expect(toKurus(5531.01)).toBe(553101)
  })

  it('adds kuruş exactly', () => {
    expect(sumKurus([10, 20, 30])).toBe(60)
    expect(sumKurus([])).toBe(0)
    // The classic float trap: 3 * 0.1 TL
    expect(sumKurus([10, 10, 10])).toBe(30)
  })
})
