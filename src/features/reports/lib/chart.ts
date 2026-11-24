// The small maths of the monthly column chart. Pure functions: easy to test.

/** A round top for the scale of the chart: 1, 2, 2.5, 5 or 10 times a power of ten, never below the biggest value. */
export function niceMax(maxKurus: number): number {
  if (!(maxKurus > 0)) return 100_00 // an empty chart still has a scale: 100 TL
  const magnitude = 10 ** Math.floor(Math.log10(maxKurus))
  for (const step of [1, 2, 2.5, 5, 10]) {
    if (step * magnitude >= maxKurus) return step * magnitude
  }
  return 10 * magnitude
}

/** The height of a column in percent of the scale. A value above zero is always visible (at least 1 %). */
export function barPercent(valueKurus: number, scaleKurus: number): number {
  if (valueKurus <= 0 || scaleKurus <= 0) return 0
  return Math.min(100, Math.max(1, (valueKurus / scaleKurus) * 100))
}

/** The five tick values of the y axis: 0, 25 %, 50 %, 75 % and 100 % of the scale. */
export const ticksFor = (scaleKurus: number): number[] => [0, 0.25, 0.5, 0.75, 1].map((f) => scaleKurus * f)

const compact = new Intl.NumberFormat('tr-TR', { notation: 'compact', maximumFractionDigits: 1 })
/** "₺12 B" (12 bin), "₺1,5 Mn": short, for the axis. */
export const compactTRY = (kurus: number): string => `₺${compact.format(kurus / 100)}`

const shortMonth = new Intl.DateTimeFormat('tr-TR', { month: 'short', timeZone: 'UTC' })
/** "2026-11-01" -> "Kas" (and the year is added for the first column and for every January). */
export function monthTick(isoDate: string, withYear: boolean): string {
  const name = shortMonth.format(new Date(`${isoDate}T12:00:00Z`)).replace('.', '')
  return withYear ? `${name} ’${isoDate.slice(2, 4)}` : name
}
