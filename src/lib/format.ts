// Formatting rules from the plan: currency TRY, dates GG.AA.YYYY, time zone Europe/Istanbul.

export const TIME_ZONE = 'Europe/Istanbul'
const LOCALE = 'tr-TR'

const currency = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'TRY' })

/** 1234.5 -> "₺1.234,50" */
export function formatTRY(amount: number): string {
  return currency.format(amount)
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

const dateFormat = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

const dateTimeFormat = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

const longDateFormat = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

// A date without a time ("2026-11-08", a Postgres `date`) has no time zone.
// Treat it as noon UTC so converting to Istanbul can never move it to another day.
function toDate(value: string | Date): Date {
  if (value instanceof Date) return value
  return new Date(DATE_ONLY.test(value) ? `${value}T12:00:00Z` : value)
}

/** "2026-11-08" or a timestamp -> "08.11.2026" */
export function formatDate(value: string | Date): string {
  return dateFormat.format(toDate(value))
}

/** A timestamp -> "09.11.2026 00:30" (always Istanbul time, whatever the device clock says) */
export function formatDateTime(value: string | Date): string {
  return dateTimeFormat.format(toDate(value))
}

/** "2026-11-08" -> "8 Kasım 2026" */
export function formatDateLong(value: string | Date): string {
  return longDateFormat.format(toDate(value))
}

/** Today's date in Istanbul as "YYYY-MM-DD" (the format Postgres `date` columns use). */
export function todayIstanbul(now: Date = new Date()): string {
  // The "en-CA" locale prints dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(now)
}
