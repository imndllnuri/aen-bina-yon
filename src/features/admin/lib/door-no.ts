/** Sorts door numbers the way people expect: 2 before 10, and "10A" after "10". */
export function compareDoorNo(a: string, b: string): number {
  return a.localeCompare(b, 'tr', { numeric: true, sensitivity: 'base' })
}
