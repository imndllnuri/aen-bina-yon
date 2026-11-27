import type { Json } from '@/lib/database.types'

// What preview_late_fees answers (migration 0013), checked field by field. Money is whole kuruş, so nothing here rounds.
// A shape that is not what we expect throws: the page then shows "could not load" instead of a wrong number.

export interface LateFeeLine {
  chargeId: string
  unitId: string
  block: string
  door: string
  /** The name of the debt type (Aidat, ...). */
  typeName: string
  /** First day of the month the debt belongs to, or null. */
  period: string | null
  dueDate: string
  tenantVisible: boolean
  /** The amount of the debt. */
  principalKurus: number
  /** What is still unpaid today. */
  remainingKurus: number
  /** Late days (after the grace days). */
  days: number
  /** The fee calculated up to today, in all. */
  feeKurus: number
  /** What was already written for this debt (cancelled lines count: they were forgiven). */
  billedKurus: number
  /** To write now (positive) or written too much (negative). */
  amountKurus: number
}

export interface LateFeePreview {
  /** The day the numbers are for (Istanbul). The server sets it. */
  asOf: string
  /** Percent per month. */
  rate: number
  method: 'daily' | 'monthly'
  graceDays: number
  /** The "Gecikme Tazminatı" debt type exists and is switched on. */
  typeReady: boolean
  lines: LateFeeLine[]
  /** Fees written higher than the right amount. Shown only: nothing is taken back by itself. */
  over: LateFeeLine[]
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

function bad(name: string): never {
  throw new Error(`late fee preview: bad ${name}`)
}
const text = (value: unknown, name: string): string => (typeof value === 'string' ? value : bad(name))
const textOrNull = (value: unknown, name: string): string | null => (value === null ? null : text(value, name))
const flag = (value: unknown, name: string): boolean => (typeof value === 'boolean' ? value : bad(name))
const whole = (value: unknown, name: string): number => (typeof value === 'number' && Number.isInteger(value) ? value : bad(name))
const decimal = (value: unknown, name: string): number => (typeof value === 'number' && Number.isFinite(value) ? value : bad(name))

function parseLine(raw: unknown): LateFeeLine {
  if (!isRecord(raw)) return bad('line')
  return {
    chargeId: text(raw.charge_id, 'charge_id'),
    unitId: text(raw.unit_id, 'unit_id'),
    block: text(raw.block, 'block'),
    door: text(raw.door, 'door'),
    typeName: text(raw.type, 'type'),
    period: textOrNull(raw.period, 'period'),
    dueDate: text(raw.due_date, 'due_date'),
    tenantVisible: flag(raw.tenant_visible, 'tenant_visible'),
    principalKurus: whole(raw.principal_kurus, 'principal_kurus'),
    remainingKurus: whole(raw.remaining_kurus, 'remaining_kurus'),
    days: whole(raw.days, 'days'),
    feeKurus: whole(raw.fee_kurus, 'fee_kurus'),
    billedKurus: whole(raw.billed_kurus, 'billed_kurus'),
    amountKurus: whole(raw.amount_kurus, 'amount_kurus'),
  }
}

export function parsePreview(json: Json): LateFeePreview {
  if (!isRecord(json)) return bad('answer')
  const method = json.method
  if (method !== 'daily' && method !== 'monthly') return bad('method')
  if (!Array.isArray(json.lines)) return bad('lines')
  if (!Array.isArray(json.over)) return bad('over')
  return {
    asOf: text(json.as_of, 'as_of'),
    rate: decimal(json.rate, 'rate'),
    method,
    graceDays: whole(json.grace_days, 'grace_days'),
    typeReady: flag(json.type_ready, 'type_ready'),
    lines: json.lines.map(parseLine),
    over: json.over.map(parseLine),
  }
}
