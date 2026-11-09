import { z } from 'zod'
import { SPLIT_METHODS } from './charges'
import { moneyProblemMessage, parseTryAmount } from './money'

// Form rules for the Borçlandırma dialogs. They give friendly Turkish messages first.
// The database repeats every rule, so these are a convenience and never the real guard.

const SPLIT_VALUES: string[] = SPLIT_METHODS.map((m) => m.value)

/** "2026-02-30" is not a real date even though it looks like one. */
export function isRealDate(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false
  const date = new Date(`${text}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text
}

/** The amount as typed ("1.500,50"). The message says exactly what is wrong. */
const money = z.string().superRefine((value, ctx) => {
  const result = parseTryAmount(value)
  if (!result.ok) ctx.addIssue({ code: 'custom', message: moneyProblemMessage(result.reason) })
})

const date = (label: string) => z.string().refine((v) => isRealDate(v), `${label}: geçerli bir tarih seçin.`)
const description = z.string().trim().max(200, 'En fazla 200 karakter yazabilirsiniz.')
const typeId = z.string().min(1, 'Borç türünü seçin.')
const period = z.string().refine((v) => /^\d{4}-\d{2}-01$/.test(v) && isRealDate(v), 'Dönemi seçin.')
const split = z.string().refine((v) => SPLIT_VALUES.includes(v), 'Paylaştırma yöntemini seçin.')
const kararNo = z.string().trim().max(60, 'En fazla 60 karakter yazabilirsiniz.')
const kararDate = z.string().refine((v) => v === '' || isRealDate(v), 'Karar tarihi: geçerli bir tarih seçin.')

/** Karar number and date go together (the database says the same). */
function kararTogether(value: { kararNo: string; kararDate: string }, ctx: z.RefinementCtx) {
  if ((value.kararNo === '') !== (value.kararDate === '')) {
    ctx.addIssue({ code: 'custom', path: [value.kararNo === '' ? 'kararNo' : 'kararDate'], message: 'Karar numarası ve karar tarihini birlikte yazın.' })
  }
}

/** Step 2 of the bulk wizard. */
export const bulkChargeSchema = z
  .object({ typeId, split, amount: money, period, dueDate: date('Son ödeme tarihi'), description, tenantVisible: z.boolean(), kararNo, kararDate })
  .superRefine(kararTogether)
export type BulkChargeValues = z.infer<typeof bulkChargeSchema>

/** One charge for one unit. The amount is that unit's amount. */
export const singleChargeSchema = z.object({
  unitId: z.string().min(1, 'Daireyi seçin.'),
  typeId,
  amount: money,
  period,
  dueDate: date('Son ödeme tarihi'),
  description,
  tenantVisible: z.boolean(),
})
export type SingleChargeValues = z.infer<typeof singleChargeSchema>

export const chargeEditSchema = z.object({
  amount: money,
  dueDate: date('Son ödeme tarihi'),
  description,
  tenantVisible: z.boolean(),
})
export type ChargeEditValues = z.infer<typeof chargeEditSchema>

export const planSchema = z
  .object({
    name: z.string().trim().min(1, 'Plan adını yazın.').max(100, 'En fazla 100 karakter yazabilirsiniz.'),
    typeId,
    split,
    amount: money,
    day: z.string().refine((v) => /^\d{1,2}$/.test(v) && Number(v) >= 1 && Number(v) <= 28, 'Son ödeme günü: 1 ile 28 arasında bir sayı yazın.'),
    tenantVisible: z.boolean(),
    description,
    kararNo,
    kararDate,
  })
  .superRefine(kararTogether)
export type PlanValues = z.infer<typeof planSchema>

export const reasonSchema = z.object({
  reason: z.string().trim().min(3, 'Nedeni en az 3 karakter olarak yazın.').max(300, 'En fazla 300 karakter yazabilirsiniz.'),
})
export type ReasonValues = z.infer<typeof reasonSchema>

/** The kuruş of an amount that already passed the schema. */
export function kurusOf(text: string): number {
  const result = parseTryAmount(text)
  if (!result.ok) throw new Error(`invalid amount: ${text}`)
  return result.kurus
}
