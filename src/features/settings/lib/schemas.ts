import { z } from 'zod'

// The fields of Ayarlar, with the same limits as the database (migration 0009). Messages are Turkish.

/** "25,49" or "25.49" -> 25.49; null when it is not a plain number with at most `decimals` decimals. */
export function parseDecimal(text: string, decimals = 2): number | null {
  const t = text.trim().replace(',', '.')
  if (!/^\d{1,4}(\.\d+)?$/.test(t)) return null
  const [, fraction = ''] = t.split('.')
  if (fraction.length > decimals) return null
  return Number(t)
}

const decimalField = (label: string, min: number, max: number) =>
  z.string().superRefine((value, ctx) => {
    const n = parseDecimal(value)
    if (n === null) ctx.addIssue({ code: 'custom', message: `${label}: sayı yazın (en fazla 2 ondalık, örnek 25,49).` })
    else if (n < min || n > max) ctx.addIssue({ code: 'custom', message: `${label}: ${String(min).replace('.', ',')} ile ${String(max).replace('.', ',')} arasında olmalı.` })
  })

/** A fee may be empty ("no fee") or a number from 0 to 10. */
const feeField = z.string().superRefine((value, ctx) => {
  if (value.trim() === '') return
  const n = parseDecimal(value)
  if (n === null || n < 0 || n > 10) ctx.addIssue({ code: 'custom', message: 'Oran 0 ile 10 arasında olmalı (örnek 2,5).' })
})

export const rulesSchema = z.object({
  dueDay: z.string().refine((v) => /^\d{1,2}$/.test(v.trim()) && Number(v) >= 1 && Number(v) <= 28, 'Son ödeme günü 1 ile 28 arasında olmalı.'),
  ydoRate: decimalField('YDO oranı', 0, 100),
  lateFeeRate: decimalField('Gecikme oranı', 0, 10),
  lateFeeMethod: z.enum(['daily', 'monthly'], { error: 'Yöntemi seçin.' }),
  graceDays: z.string().refine((v) => /^\d{1,2}$/.test(v.trim()) && Number(v) <= 60, 'Ek süre 0 ile 60 gün arasında olmalı.'),
  commissionPayer: z.enum(['management', 'resident'], { error: 'Seçin.' }),
  fee2: feeField,
  fee3: feeField,
  fee6: feeField,
  fee9: feeField,
})
export type RulesValues = z.infer<typeof rulesSchema>

export const companySchema = z.object({
  name: z.string().trim().min(1, 'Firma adını yazın.').max(200, 'Firma adı en fazla 200 karakter olabilir.'),
  phone: z.string().trim().max(30, 'Telefon en fazla 30 karakter olabilir.'),
  email: z
    .string()
    .trim()
    .max(200, 'E-posta en fazla 200 karakter olabilir.')
    .refine((v) => v === '' || /^[^\s@]+@[^\s@]+$/.test(v), 'Geçerli bir e-posta adresi yazın.'),
  address: z.string().trim().max(500, 'Adres en fazla 500 karakter olabilir.'),
  taxNo: z.string().trim().max(30, 'Vergi no en fazla 30 karakter olabilir.'),
})
export type CompanyValues = z.infer<typeof companySchema>

export const chargeTypeSchema = z.object({
  name: z.string().trim().min(1, 'Adı yazın.').max(100, 'Ad en fazla 100 karakter olabilir.'),
  split: z.enum(['equal', 'land_share', 'gross_m2', 'per_unit'], { error: 'Dağıtım yöntemini seçin.' }),
  tenantVisible: z.boolean(),
  active: z.boolean(),
  sort: z.string().refine((v) => /^\d{1,3}$/.test(v.trim()), 'Sıra 0 ile 999 arasında bir sayı olmalı.'),
})
export type ChargeTypeValues = z.infer<typeof chargeTypeSchema>

export const SPLIT_LABEL: Record<string, string> = {
  equal: 'Eşit',
  land_share: 'Arsa payına göre',
  gross_m2: 'Brüt m²’ye göre',
  per_unit: 'Daire başı (her daireye aynı tutar)',
}
