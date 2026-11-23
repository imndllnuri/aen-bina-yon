import { formatDate, monthLabel } from '@/lib/format'

/** "Aidat · Kasım 2026" (and the description when there is one). */
export function lineLabel(line: { typeName: string | null; description: string | null; period: string | null; dueDate: string }): string {
  const type = line.typeName ?? 'Borç'
  const when = line.period ? monthLabel(line.period) : formatDate(line.dueDate)
  return line.description ? `${type} · ${when} · ${line.description}` : `${type} · ${when}`
}

/** "2026-11-23" + (-90) -> "2026-08-25". A date without a time of day, so the time zone cannot move it. */
export function shiftDate(isoDate: string, days: number): string {
  return new Date(Date.parse(`${isoDate}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
}
