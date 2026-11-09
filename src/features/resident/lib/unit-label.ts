import type { MyUnit } from '../api'
import { RELATION_LABEL } from './ledger'

/** "A Blok · 1" */
export const unitLabel = (unit: MyUnit) => `${unit.blockName} · ${unit.doorNo}`

/** "Kat Maliki", "Kiracı", or "Kat Maliki ve Kiracı" for a person who is both. */
export const relationLabel = (unit: MyUnit) => unit.relations.map((r) => RELATION_LABEL[r]).join(' ve ')
