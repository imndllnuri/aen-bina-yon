import { TIME_ZONE } from '@/lib/format'

// The app lives in Istanbul time (UTC+3 all year, there is no summer time any more). A <input type="datetime-local"> gives
// "2026-11-25T14:30" with no zone: it is read as Istanbul time, whatever the clock of the device says.

/** "2026-11-25T14:30" -> "2026-11-25T14:30:00+03:00", or null for an empty / impossible value. */
export function istanbulLocalToIso(value: string): string | null {
  const text = value.trim()
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text)) return null
  const date = new Date(`${text}:00+03:00`)
  if (Number.isNaN(date.getTime())) return null
  // "2026-02-30T10:00" rolls over to March: refuse it
  if (isoToIstanbulLocal(date.toISOString()) !== text) return null
  return `${text}:00+03:00`
}

const parts = new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

/** A timestamp -> "2026-11-25T14:30" in Istanbul time (the value for a datetime-local input). */
export function isoToIstanbulLocal(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const get = (type: string) => parts.formatToParts(date).find((p) => p.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`
}
