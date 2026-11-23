// Turkish IBAN: "TR" + 24 digits, with the ISO 7064 check (the number mod 97 must be 1).
// The database checks the same rule when the admin saves an account; here it only warns early.

/** Removes spaces, upper case. */
export const normalizeIban = (text: string): string => text.replace(/\s+/g, '').toUpperCase()

export function isValidTrIban(text: string): boolean {
  const iban = normalizeIban(text)
  if (!/^TR\d{24}$/.test(iban)) return false
  // Move the first four characters to the end; the letters T and R become 29 and 27.
  const digits = (iban.slice(4) + iban.slice(0, 4)).replace('T', '29').replace('R', '27')
  let rest = 0
  for (const digit of digits) rest = (rest * 10 + Number(digit)) % 97
  return rest === 1
}

/** "TR330006100519786457841326" -> "TR33 0006 1005 1978 6457 8413 26" (easier to read and to compare with the bank app). */
export function formatIban(text: string): string {
  return normalizeIban(text).replace(/(.{4})/g, '$1 ').trim()
}
