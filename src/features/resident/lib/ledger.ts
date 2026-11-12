// Pure helpers for the resident pages (Ana Sayfa, Borçlarım, ekstre). No network, easy to test.
//
// What these helpers do NOT do: decide what a resident may see. The database does that (Row Level
// Security, migration 0004). A tenant's list already arrives without the lines they may not see, and
// the running balance already counts only the visible lines. These helpers only sort, group and label.

export type LineStatus = 'open' | 'overdue' | 'partial' | 'paid'

export interface LedgerLine {
  id: string
  typeName: string
  period: string | null
  description: string | null
  amountKurus: number
  paidKurus: number
  /** What is still owed on this line. */
  remainingKurus: number
  dueDate: string
  status: LineStatus
  createdAt: string
  /** The debt after this line, in due date order. Computed by the database. */
  runningKurus: number
}

export const STATUS_LABEL: Record<LineStatus, string> = {
  open: 'Ödenmedi',
  overdue: 'Gecikmiş',
  partial: 'Kısmi',
  paid: 'Ödendi',
}

/** The order of the database's running balance: due date, then creation time, then id. */
export function sortLedger(lines: LedgerLine[]): LedgerLine[] {
  return [...lines].sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
}

export type DebtTab = 'unpaid' | 'upcoming' | 'paid' | 'all'

export const TAB_LABEL: Record<DebtTab, string> = {
  unpaid: 'Ödenmemiş',
  upcoming: 'Gelecek',
  paid: 'Ödenmiş',
  all: 'Tümü',
}

/**
 *   Ödenmemiş  something is owed and the due date is today or already past
 *   Gelecek    something is owed and the due date is still ahead
 *   Ödenmiş    nothing is owed any more
 * Dates are YYYY-MM-DD text, so comparing the text compares the dates.
 */
export function linesForTab(lines: LedgerLine[], tab: DebtTab, today: string): LedgerLine[] {
  const sorted = sortLedger(lines)
  switch (tab) {
    case 'unpaid':
      return sorted.filter((l) => l.remainingKurus > 0 && l.dueDate <= today)
    case 'upcoming':
      return sorted.filter((l) => l.remainingKurus > 0 && l.dueDate > today)
    case 'paid':
      return sorted.filter((l) => l.remainingKurus === 0)
    case 'all':
      return sorted
  }
}

export function tabCounts(lines: LedgerLine[], today: string): Record<DebtTab, number> {
  return {
    unpaid: linesForTab(lines, 'unpaid', today).length,
    upcoming: linesForTab(lines, 'upcoming', today).length,
    paid: linesForTab(lines, 'paid', today).length,
    all: lines.length,
  }
}

/** The next three lines that still have to be paid: overdue ones first, then by due date. */
export function nextThree(lines: LedgerLine[]): LedgerLine[] {
  return sortLedger(lines)
    .filter((l) => l.remainingKurus > 0)
    .slice(0, 3)
}

export interface Statement {
  /** The debt before the first line of the range (the running balance of the last earlier line). */
  openingKurus: number
  rows: LedgerLine[]
  /** The debt after the last line of the range. */
  closingKurus: number
}

/** The statement (ekstre) for a date range, by due date. `from` and `to` are included. */
export function statementFor(lines: LedgerLine[], from: string, to: string): Statement {
  const sorted = sortLedger(lines)
  const before = sorted.filter((l) => l.dueDate < from)
  const rows = sorted.filter((l) => l.dueDate >= from && l.dueDate <= to)
  const openingKurus = before.at(-1)?.runningKurus ?? 0
  return { openingKurus, rows, closingKurus: rows.at(-1)?.runningKurus ?? openingKurus }
}

/** The whole current year: "2026-01-01" to "2026-12-31". */
export function yearRange(today: string): { from: string; to: string } {
  const year = today.slice(0, 4)
  return { from: `${year}-01-01`, to: `${year}-12-31` }
}

/** "Ayşe Kaya" -> "Ayşe". Falls back to nothing, so the greeting stays friendly without a name. */
export function firstName(fullName: string | null): string {
  return (fullName ?? '').trim().split(/\s+/)[0] ?? ''
}

export const RELATION_LABEL = { owner: 'Kat Maliki', tenant: 'Kiracı' } as const
