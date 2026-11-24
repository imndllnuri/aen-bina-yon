// Month arithmetic on "YYYY-MM-01" strings (no time zones involved: a month is just a label).

/** "2026-11-01" + 2 -> "2027-01-01"; n can be negative. */
export function addMonths(firstOfMonth: string, n: number): string {
  const year = Number(firstOfMonth.slice(0, 4))
  const month = Number(firstOfMonth.slice(5, 7)) - 1
  const total = year * 12 + month + n
  const y = Math.floor(total / 12)
  const m = total - y * 12
  return `${String(y).padStart(4, '0')}-${String(m + 1).padStart(2, '0')}-01`
}

/** How many months from `from` to `to` (both "YYYY-MM-01"); negative when `to` is earlier. */
export function monthsBetween(from: string, to: string): number {
  return (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + (Number(to.slice(5, 7)) - Number(from.slice(5, 7)))
}

/** The value of an <input type="month">: "2026-11" -> "2026-11-01"; null when it is not a month. */
export function monthInputToDate(value: string): string | null {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? `${value}-01` : null
}

/** "2026-11-01" -> "2026-11" (for an <input type="month">). */
export const dateToMonthInput = (firstOfMonth: string) => firstOfMonth.slice(0, 7)

/** The most months the monthly report can show (the database refuses more). */
export const MAX_MONTHS = 60
