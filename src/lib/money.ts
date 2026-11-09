import { formatTRY } from '@/lib/format'

// Turkish money input. Money is handled as whole KURUŞ (1 TL = 100 kuruş) so there is no
// floating point error anywhere. The database does the same.
//
// Why this exists: in Turkish "1.500" means ONE THOUSAND FIVE HUNDRED (the dot groups thousands)
// but a normal number parser reads it as 1.5. A 1000x mistake on a charge is not acceptable.

/** The same limit as the database: 9.999.999,99 TL. */
export const MAX_KURUS = 999_999_999

export type MoneyProblem = 'empty' | 'format' | 'ambiguous_dot' | 'decimals' | 'zero' | 'too_big'

export type MoneyParseResult = { ok: true; kurus: number } | { ok: false; reason: MoneyProblem }

// "1.500" and "12.345.678": groups of exactly three digits after the first group.
const GROUPED = /^\d{1,3}(\.\d{3})+$/
const PLAIN = /^\d+$/

/**
 * Accepts: 1500   1500,50   1.500   1.500,50   0,5   ₺1.500,00   1.500 TL
 * Refuses: 1.5   1500.50   1,555   0   -5   abc   (a dot that is not a thousands group is unclear)
 */
export function parseTryAmount(input: string): MoneyParseResult {
  const text = input.replace(/\s+/g, '').replace(/₺|TL/gi, '')
  if (text === '') return { ok: false, reason: 'empty' }

  const parts = text.split(',')
  if (parts.length > 2) return { ok: false, reason: 'format' }
  const [intPart, decPart] = parts

  let digits: string
  if (PLAIN.test(intPart)) digits = intPart
  else if (GROUPED.test(intPart)) digits = intPart.replaceAll('.', '')
  else if (/^[\d.]+$/.test(intPart) && intPart.includes('.')) return { ok: false, reason: 'ambiguous_dot' }
  else return { ok: false, reason: 'format' }

  let decimals = 0
  if (decPart !== undefined) {
    if (!/^\d+$/.test(decPart)) return { ok: false, reason: 'format' }
    if (decPart.length > 2) return { ok: false, reason: 'decimals' }
    decimals = Number(decPart.padEnd(2, '0'))
  }

  digits = digits.replace(/^0+(?=\d)/, '')
  if (digits.length > 9) return { ok: false, reason: 'too_big' }
  const kurus = Number(digits) * 100 + decimals
  if (kurus > MAX_KURUS) return { ok: false, reason: 'too_big' }
  if (kurus === 0) return { ok: false, reason: 'zero' }
  return { ok: true, kurus }
}

const PROBLEMS: Record<MoneyProblem, string> = {
  empty: 'Tutarı yazın.',
  format: 'Tutarı rakamlarla yazın. Örnek: 1.500,50',
  ambiguous_dot: 'Binler için nokta, kuruş için virgül kullanın. Örnek: 1.500,50',
  decimals: 'En fazla 2 ondalık (kuruş) yazabilirsiniz.',
  zero: "Tutar 0'dan büyük olmalı.",
  too_big: 'Tutar en fazla 9.999.999,99 ₺ olabilir.',
}

export const moneyProblemMessage = (reason: MoneyProblem) => PROBLEMS[reason]

/** 150000 -> "₺1.500,00" */
export const formatKurus = (kurus: number) => formatTRY(kurus / 100)

/** A database amount (numeric(12,2) arrives as a JSON number such as 696.9) -> whole kuruş. */
export const toKurus = (amount: number) => Math.round(amount * 100)

/** Adds whole kuruş. Never add TL amounts as decimals. */
export const sumKurus = (values: number[]) => values.reduce((total, value) => total + value, 0)
