import { describe, expect, it } from 'vitest'
import { firstName, linesForTab, nextThree, sortLedger, statementFor, tabCounts, yearRange, type LedgerLine } from './ledger'

const line = (over: Partial<LedgerLine> & { id: string; dueDate: string }): LedgerLine => ({
  typeName: 'Aidat', period: null, description: null, amountKurus: 10000, paidKurus: 0, remainingKurus: 10000,
  status: 'open', createdAt: '2026-01-01T00:00:00Z', runningKurus: 0, ...over,
})

// today = 2026-11-09
const TODAY = '2026-11-09'
const lines: LedgerLine[] = [
  line({ id: 'a', dueDate: '2026-09-15', status: 'overdue', amountKurus: 10000, remainingKurus: 10000, runningKurus: 10000 }),
  line({ id: 'b', dueDate: '2026-10-15', status: 'overdue', amountKurus: 20000, remainingKurus: 20000, runningKurus: 30000 }),
  line({ id: 'c', dueDate: '2026-11-09', amountKurus: 5000, remainingKurus: 5000, runningKurus: 35000 }), // due today
  line({ id: 'd', dueDate: '2026-11-20', amountKurus: 7000, remainingKurus: 7000, runningKurus: 42000 }),
  line({ id: 'e', dueDate: '2026-12-15', amountKurus: 7000, remainingKurus: 7000, runningKurus: 49000 }),
  line({ id: 'f', dueDate: '2026-08-15', amountKurus: 9000, paidKurus: 9000, remainingKurus: 0, runningKurus: 0 }), // paid (slice 6)
]

describe('sortLedger', () => {
  it('sorts by due date, then creation time, then id (the order of the database running balance)', () => {
    const tie = [
      line({ id: 'z', dueDate: '2026-11-20', createdAt: '2026-01-02T00:00:00Z' }),
      line({ id: 'y', dueDate: '2026-11-20', createdAt: '2026-01-01T00:00:00Z' }),
      line({ id: 'x', dueDate: '2026-11-20', createdAt: '2026-01-01T00:00:00Z' }),
      line({ id: 'w', dueDate: '2026-10-01' }),
    ]
    expect(sortLedger(tie).map((l) => l.id)).toEqual(['w', 'x', 'y', 'z'])
  })
  it('does not change the list it was given', () => {
    const input = [line({ id: 'b', dueDate: '2026-02-01' }), line({ id: 'a', dueDate: '2026-01-01' })]
    sortLedger(input)
    expect(input.map((l) => l.id)).toEqual(['b', 'a'])
  })
})

describe('tabs', () => {
  it('Ödenmemiş: owed and due today or earlier', () => {
    expect(linesForTab(lines, 'unpaid', TODAY).map((l) => l.id)).toEqual(['a', 'b', 'c'])
  })
  it('Gelecek: owed and due after today', () => {
    expect(linesForTab(lines, 'upcoming', TODAY).map((l) => l.id)).toEqual(['d', 'e'])
  })
  it('Ödenmiş: nothing owed any more', () => {
    expect(linesForTab(lines, 'paid', TODAY).map((l) => l.id)).toEqual(['f'])
  })
  it('Tümü: everything, in order', () => {
    expect(linesForTab(lines, 'all', TODAY).map((l) => l.id)).toEqual(['f', 'a', 'b', 'c', 'd', 'e'])
  })
  it('counts every tab', () => {
    expect(tabCounts(lines, TODAY)).toEqual({ unpaid: 3, upcoming: 2, paid: 1, all: 6 })
  })
  it('a partly paid line is still owed', () => {
    const partly = [line({ id: 'p', dueDate: '2026-11-01', amountKurus: 10000, paidKurus: 4000, remainingKurus: 6000 })]
    expect(linesForTab(partly, 'unpaid', TODAY)).toHaveLength(1)
    expect(linesForTab(partly, 'paid', TODAY)).toHaveLength(0)
  })
})

describe('nextThree', () => {
  it('takes the first three lines that are still owed: overdue first', () => {
    expect(nextThree(lines).map((l) => l.id)).toEqual(['a', 'b', 'c'])
  })
  it('skips paid lines and copes with fewer than three', () => {
    expect(nextThree([lines[5]])).toEqual([])
    expect(nextThree([lines[3]]).map((l) => l.id)).toEqual(['d'])
  })
})

describe('statementFor (ekstre)', () => {
  it('starts with the debt before the range and ends with the debt after it', () => {
    const s = statementFor(lines, '2026-10-01', '2026-11-30')
    expect(s.openingKurus).toBe(10000) // the last line before 1 October is the September one: the debt after it was 100,00 TL
    expect(s.rows.map((l) => l.id)).toEqual(['b', 'c', 'd'])
    expect(s.closingKurus).toBe(42000)
  })

  it('takes the opening balance from the last earlier line in due date order', () => {
    const ordered: LedgerLine[] = [
      line({ id: '1', dueDate: '2026-01-15', runningKurus: 10000 }),
      line({ id: '2', dueDate: '2026-02-15', runningKurus: 20000 }),
      line({ id: '3', dueDate: '2026-03-15', runningKurus: 30000 }),
      line({ id: '4', dueDate: '2026-04-15', runningKurus: 40000 }),
    ]
    const s = statementFor(ordered, '2026-03-01', '2026-03-31')
    expect(s.openingKurus).toBe(20000)
    expect(s.rows.map((l) => l.id)).toEqual(['3'])
    expect(s.closingKurus).toBe(30000)
  })

  it('includes both ends of the range', () => {
    const ordered = [line({ id: '1', dueDate: '2026-03-01', runningKurus: 1 }), line({ id: '2', dueDate: '2026-03-31', runningKurus: 2 })]
    expect(statementFor(ordered, '2026-03-01', '2026-03-31').rows).toHaveLength(2)
  })

  it('an empty range keeps the opening balance as the closing balance', () => {
    const ordered = [line({ id: '1', dueDate: '2026-01-15', runningKurus: 10000 })]
    const s = statementFor(ordered, '2026-05-01', '2026-05-31')
    expect(s).toEqual({ openingKurus: 10000, rows: [], closingKurus: 10000 })
  })

  it('a range before any line starts from zero', () => {
    const ordered = [line({ id: '1', dueDate: '2026-06-15', runningKurus: 10000 })]
    expect(statementFor(ordered, '2026-01-01', '2026-02-01')).toEqual({ openingKurus: 0, rows: [], closingKurus: 0 })
  })
})

describe('small helpers', () => {
  it('the current year', () => {
    expect(yearRange('2026-11-09')).toEqual({ from: '2026-01-01', to: '2026-12-31' })
  })
  it('first name for the greeting', () => {
    expect(firstName('Ayşe Kaya')).toBe('Ayşe')
    expect(firstName('  Ayşe   Nur Kaya ')).toBe('Ayşe')
    expect(firstName('Ayşe')).toBe('Ayşe')
    expect(firstName(null)).toBe('')
    expect(firstName('')).toBe('')
  })
})
