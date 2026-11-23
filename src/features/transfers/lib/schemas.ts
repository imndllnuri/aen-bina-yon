import { z } from 'zod'
import { isRealDate } from '@/features/admin/lib/charge-schemas'
import { moneyProblemMessage, parseTryAmount } from '@/lib/money'
import { isValidTrIban } from './iban'
import { shiftDate } from './lines'

// Form rules for the havale notice, the manual payment and the bank accounts.
// They give friendly Turkish messages first. The database repeats every rule: these are never the real guard.

/** The amount as typed ("1.500,50"), at least `minKurus`. */
const money = (minKurus: number, tooSmall: string) =>
  z.string().superRefine((value, ctx) => {
    const result = parseTryAmount(value)
    if (!result.ok) ctx.addIssue({ code: 'custom', message: moneyProblemMessage(result.reason) })
    else if (result.kurus < minKurus) ctx.addIssue({ code: 'custom', message: tooSmall })
  })

const dateBetween = (label: string, earliest: string, latest: string, tooOld: string) =>
  z
    .string()
    .refine((v) => isRealDate(v), `${label}: geçerli bir tarih seçin.`)
    .refine((v) => v <= latest, 'Gelecekteki bir tarih seçilemez.')
    .refine((v) => v >= earliest, tooOld)

const note = z.string().trim().max(300, 'En fazla 300 karakter yazabilirsiniz.')

/** The resident's havale notice. `today` is the Istanbul date as "YYYY-MM-DD". */
export function noticeSchema(today: string) {
  return z.object({
    amount: money(100, 'En az 1 ₺ yazın.'),
    sentOn: dateBetween('Gönderim tarihi', shiftDate(today, -90), today, 'Dekont tarihi en fazla 90 gün öncesi olabilir.'),
    senderName: z.string().trim().min(2, 'Havaleyi yapanın adını yazın.').max(100, 'En fazla 100 karakter yazabilirsiniz.'),
    note,
  })
}
export type NoticeValues = z.infer<ReturnType<typeof noticeSchema>>

export const PAYER_OTHER = 'other'

/** The admin's manual payment. The payer is a resident of the unit, or somebody else whose name is typed. */
export function manualPaymentSchema(today: string) {
  return z
    .object({
      unitId: z.string().min(1, 'Daireyi seçin.'),
      payer: z.string().min(1, 'Ödeyen kişiyi seçin.'),
      payerName: z.string().trim().max(100, 'En fazla 100 karakter yazabilirsiniz.'),
      method: z.enum(['cash', 'pos', 'havale'], { error: 'Ödeme yöntemini seçin.' }),
      amount: money(1, "Tutar 0'dan büyük olmalı."),
      paidOn: dateBetween('Ödeme tarihi', shiftDate(today, -365), today, 'Ödeme tarihi en fazla 1 yıl öncesi olabilir.'),
      note,
    })
    .superRefine((value, ctx) => {
      if (value.payer === PAYER_OTHER && value.payerName.length < 2) {
        ctx.addIssue({ code: 'custom', path: ['payerName'], message: 'Ödeyen kişinin adını yazın.' })
      }
    })
}
export type ManualPaymentValues = z.infer<ReturnType<typeof manualPaymentSchema>>

export const bankAccountsSchema = z
  .object({
    accounts: z
      .array(
        z.object({
          bank: z.string().trim().min(2, 'Banka adını yazın.').max(60, 'En fazla 60 karakter.'),
          holder: z.string().trim().min(2, 'Hesap sahibini yazın.').max(100, 'En fazla 100 karakter.'),
          iban: z.string().refine((v) => isValidTrIban(v), 'IBAN geçerli değil. TR ile başlayan 26 karakteri kontrol edin.'),
        }),
      )
      .max(5, 'En fazla 5 hesap ekleyebilirsiniz.'),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<string>()
    value.accounts.forEach((account, index) => {
      const iban = account.iban.replace(/\s+/g, '').toUpperCase()
      if (seen.has(iban)) ctx.addIssue({ code: 'custom', path: ['accounts', index, 'iban'], message: 'Bu IBAN zaten listede var.' })
      seen.add(iban)
    })
  })
export type BankAccountsValues = z.infer<typeof bankAccountsSchema>
