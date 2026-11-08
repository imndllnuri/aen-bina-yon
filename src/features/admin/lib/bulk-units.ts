// The "bulk generator" of the Daireler page: "A Blok, 10 kat, katta 4 daire" (plan, section 8).
// Pure functions, so every rule can be tested without a browser or a database.

/** Upper limit for one run. Protects against a typo like 1000 floors x 50 units. */
export const MAX_BULK_UNITS = 300

export interface BulkOptions {
  floors: number
  perFloor: number
  /** Door number of the very first unit. The next ones count up: 1, 2, 3, ... */
  startNumber: number
  /** Floor of the first row. Use 0 for "Zemin kat", -1 for "Bodrum". */
  startFloor: number
}

export interface GeneratedUnit {
  door_no: string
  floor: number
}

/** Returns a message for the first problem, or null when the options are fine. */
export function validateBulk(options: BulkOptions): string | null {
  const { floors, perFloor, startNumber, startFloor } = options
  if (![floors, perFloor, startNumber, startFloor].every(Number.isInteger)) return 'Tüm alanlara tam sayı yazın.'
  if (floors < 1 || floors > 100) return 'Kat sayısı 1 ile 100 arasında olmalı.'
  if (perFloor < 1 || perFloor > 50) return 'Katta daire sayısı 1 ile 50 arasında olmalı.'
  if (startNumber < 1 || startNumber > 99999) return 'Başlangıç kapı numarası 1 ile 99999 arasında olmalı.'
  if (startFloor < -10 || startFloor > 200) return 'Başlangıç katı -10 ile 200 arasında olmalı.'
  if (floors * perFloor > MAX_BULK_UNITS) return `Tek seferde en fazla ${MAX_BULK_UNITS} daire oluşturulabilir.`
  return null
}

/**
 * Door numbers count up without gaps: 4 per floor from 1 gives 1,2,3,4 on the first floor,
 * 5,6,7,8 on the second, and so on. Returns [] when the options are not valid.
 */
export function generateUnits(options: BulkOptions): GeneratedUnit[] {
  if (validateBulk(options) !== null) return []
  const { floors, perFloor, startNumber, startFloor } = options
  const units: GeneratedUnit[] = []
  for (let index = 0; index < floors * perFloor; index += 1) {
    units.push({ door_no: String(startNumber + index), floor: startFloor + Math.floor(index / perFloor) })
  }
  return units
}

/** Door numbers that are already used in the block (the database allows each number once per block). */
export function findDoorConflicts(units: GeneratedUnit[], existingDoorNumbers: string[]): string[] {
  const taken = new Set(existingDoorNumbers.map((door) => door.trim().toLowerCase()))
  return units.map((unit) => unit.door_no).filter((door) => taken.has(door.toLowerCase()))
}

/** The number after the highest numeric door number in the block (1 for an empty block). */
export function nextDoorNumber(existingDoorNumbers: string[]): number {
  const numbers = existingDoorNumbers.map((door) => Number.parseInt(door, 10)).filter((n) => Number.isInteger(n) && n > 0)
  return numbers.length === 0 ? 1 : Math.max(...numbers) + 1
}
