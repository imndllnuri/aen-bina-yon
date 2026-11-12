import { supabase } from '@/lib/supabase'

// The receipt (makbuz) comes from the database function get_receipt(): it checks who is asking and reads
// the stored snapshot. The browser never builds a receipt from what it remembers.

function client() {
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}

export interface ReceiptLine {
  typeName: string | null
  description: string | null
  period: string | null
  dueDate: string
  amountKurus: number
}

export interface Receipt {
  receiptNo: string
  paidAt: string
  status: 'approved' | 'voided'
  voidReason: string | null
  method: string
  provider: string
  installments: number
  amountKurus: number
  feeKurus: number
  totalKurus: number
  payerName: string | null
  unitLabel: string
  siteName: string
  companyName: string
  lines: ReceiptLine[]
}

interface RawLine {
  type_name: string | null
  description: string | null
  period: string | null
  due_date: string
  amount_kurus: number
}

export async function fetchReceipt(paymentId: string): Promise<Receipt> {
  const { data, error } = await client().rpc('get_receipt', { p_payment: paymentId })
  if (error) throw error
  const row = data[0]
  if (!row) throw new Error('receipt not found')
  const raw = Array.isArray(row.lines) ? (row.lines as unknown as RawLine[]) : []
  return {
    receiptNo: row.receipt_no,
    paidAt: row.paid_at,
    status: row.status === 'voided' ? 'voided' : 'approved',
    voidReason: row.void_reason,
    method: row.method,
    provider: row.provider,
    installments: row.installments,
    amountKurus: row.amount_kurus,
    feeKurus: row.fee_kurus,
    totalKurus: row.total_kurus,
    payerName: row.payer_name,
    unitLabel: row.unit_label,
    siteName: row.site_name,
    companyName: row.company_name,
    lines: raw.map((line) => ({
      typeName: line.type_name,
      description: line.description,
      period: line.period,
      dueDate: line.due_date,
      amountKurus: line.amount_kurus,
    })),
  }
}

/** "Kart", "Havale / EFT" ... for the receipt and the payment lists. */
export const METHOD_LABEL: Record<string, string> = { card: 'Kart', havale: 'Havale / EFT', cash: 'Nakit', pos: 'Ofiste kart' }
export const methodLabel = (method: string) => METHOD_LABEL[method] ?? method

export function installmentsLabel(installments: number): string {
  return installments === 1 ? 'Tek çekim' : `${installments} taksit`
}
