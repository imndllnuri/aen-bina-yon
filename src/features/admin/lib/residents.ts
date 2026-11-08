// Small decisions the Sakinler page makes. Pure functions, so they are easy to test.

export type ResidentStatus = 'inactive' | 'pending' | 'active'

/**
 * - inactive: the account was deactivated (kept for history, no access).
 * - pending : invited, but has not finished the invite page. That page records the KVKK consent
 *             as its LAST step, so "no consent yet" means "not finished".
 * - active  : finished the invite page.
 */
export function residentStatus(person: { isActive: boolean; kvkkConsentAt: string | null }): ResidentStatus {
  if (!person.isActive) return 'inactive'
  return person.kvkkConsentAt === null ? 'pending' : 'active'
}

export const STATUS_LABEL: Record<ResidentStatus, string> = {
  inactive: 'Devre dışı',
  pending: 'Davet bekliyor',
  active: 'Aktif',
}

/**
 * Dates are Postgres dates (YYYY-MM-DD), so plain text comparison is correct.
 * The end date is the day the person MOVED OUT: from that day on they no longer live there.
 * (Same rule as private.my_units() in the database.)
 */
export function isCurrentResidency(residency: { startDate: string; endDate: string | null }, today: string): boolean {
  return residency.startDate <= today && (residency.endDate === null || residency.endDate > today)
}

/**
 * Should the page offer "Bağlantı oluştur"? Only a hint: the server decides again.
 * Offered for people who live here now, are active, and have not finished the invite page.
 */
export function canRequestLink(
  person: { isActive: boolean; kvkkConsentAt: string | null; startDate: string; endDate: string | null },
  today: string,
): boolean {
  return residentStatus(person) === 'pending' && isCurrentResidency(person, today)
}

/** Text search over name, e-mail, phone and the unit ("A Blok 12"). */
export function matchesQuery(
  row: { fullName: string | null; email: string | null; phone: string | null; blockName: string; doorNo: string },
  query: string,
): boolean {
  const needle = query.trim().toLocaleLowerCase('tr')
  if (needle === '') return true
  const haystack = [row.fullName, row.email, row.phone, row.blockName, row.doorNo, `${row.blockName} ${row.doorNo}`]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase('tr')
  return haystack.includes(needle)
}
