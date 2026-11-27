import { sumKurus } from '@/lib/money'
import type { LateFeeLine, LateFeePreview } from './parse'

// Small pure helpers of the Gecikme Tazminatı page. The fee itself is worked out by the database only.

export const methodLabel = (method: LateFeePreview['method']) => (method === 'daily' ? 'Günlük (borç × oran ÷ 30 × gün)' : 'Başlanan her ay için')

/** What the person ticked: the ids to send, how many, and the sum in kuruş (the database checks these numbers again). */
export function selectionTotals(lines: LateFeeLine[], selected: ReadonlySet<string>) {
  const picked = lines.filter((line) => selected.has(line.chargeId))
  return { ids: picked.map((line) => line.chargeId), count: picked.length, kurus: sumKurus(picked.map((line) => line.amountKurus)) }
}

export const unitName = (line: Pick<LateFeeLine, 'block' | 'door'>) => `${line.block} · ${line.door}`

/** "40 gün", or for the monthly method "2 ay (40 gün)": every started 30 days is a month. */
export function lateLabel(days: number, method: LateFeePreview['method']): string {
  return method === 'monthly' ? `${Math.ceil(days / 30)} ay (${days} gün)` : `${days} gün`
}

/** Plain warnings above the list. They do not block anything: the admin decides. */
export function ruleWarnings(preview: Pick<LateFeePreview, 'rate' | 'method'>): string[] {
  const warnings: string[] = []
  if (preview.rate > 5) {
    warnings.push(`Oran %${String(preview.rate).replace('.', ',')}: Kat Mülkiyeti Kanunu md. 20 aylık %5 öngörür. Bu oran yasal oranın üzerinde. Yazmadan önce yönetim planınıza bakın ya da bir hukuk danışmanına sorun.`)
  }
  if (preview.method === 'monthly') {
    warnings.push('“Başlanan her ay” yönteminde gecikmenin ilk günü bile tam ay sayılır. Bu uygulama tartışma konusu olabilir. Emin değilseniz günlük yöntemi seçin ya da bir hukuk danışmanına sorun.')
  }
  return warnings
}
