import { useMemo } from 'react'
import { NativeSelect } from '@/components/NativeSelect'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import type { BlockRow, UnitRow } from '../api'
import { targetUnitCount, type ChargeTarget } from '../lib/charges'

/**
 * "Which units?": the whole site, one block, or hand-picked units. The result is exactly the JSON
 * the database function reads. The database checks every unit again (site, archived).
 */
export function TargetPicker({
  blocks,
  units,
  value,
  onChange,
  idPrefix,
}: {
  blocks: BlockRow[]
  units: UnitRow[]
  value: ChargeTarget
  onChange: (target: ChargeTarget) => void
  idPrefix: string
}) {
  const byBlock = useMemo(() => {
    const map = new Map<string, UnitRow[]>()
    for (const unit of units) map.set(unit.blockId, [...(map.get(unit.blockId) ?? []), unit])
    return map
  }, [units])

  const selected = value.scope === 'units' ? new Set(value.unit_ids) : new Set<string>()
  const setUnits = (ids: string[]) => onChange({ scope: 'units', unit_ids: ids })
  const toggle = (id: string, on: boolean) => setUnits(on ? [...selected, id] : [...selected].filter((x) => x !== id))
  const count = targetUnitCount(value, units)

  const radio = (scope: ChargeTarget['scope'], label: string, onSelect: () => void) => (
    <label className="flex items-center gap-2 text-sm font-medium">
      <input
        type="radio"
        name={`${idPrefix}-scope`}
        checked={value.scope === scope}
        onChange={onSelect}
        className="size-4 accent-primary"
      />
      {label}
    </label>
  )

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">Hangi dairelere?</legend>

      <div className="space-y-1.5">
        {radio('site', `Tüm site (${units.length} daire)`, () => onChange({ scope: 'site' }))}
      </div>

      <div className="space-y-1.5">
        {radio('block', 'Bir blok', () => onChange({ scope: 'block', block_id: blocks[0]?.id ?? '' }))}
        {value.scope === 'block' && (
          <NativeSelect
            aria-label="Blok"
            value={value.block_id}
            onChange={(event) => onChange({ scope: 'block', block_id: event.target.value })}
            className="max-w-xs"
          >
            {blocks.map((block) => (
              <option key={block.id} value={block.id}>
                {block.name} ({byBlock.get(block.id)?.length ?? 0} daire)
              </option>
            ))}
          </NativeSelect>
        )}
      </div>

      <div className="space-y-1.5">
        {radio('units', 'Seçtiğim daireler', () => setUnits([]))}
        {value.scope === 'units' && (
          <div className="max-h-64 space-y-3 overflow-y-auto rounded-lg border p-3">
            {blocks.map((block) => {
              const blockUnits = byBlock.get(block.id) ?? []
              if (blockUnits.length === 0) return null
              return (
                <div key={block.id} className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{block.name}</span>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setUnits([...new Set([...selected, ...blockUnits.map((u) => u.id)])])}>
                      Hepsini seç
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setUnits([...selected].filter((id) => !blockUnits.some((u) => u.id === id)))}>
                      Temizle
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {blockUnits.map((unit) => (
                      <label key={unit.id} className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-sm">
                        <Checkbox
                          checked={selected.has(unit.id)}
                          onCheckedChange={(checked) => toggle(unit.id, checked === true)}
                          aria-label={`${block.name} ${unit.doorNo}`}
                        />
                        {unit.doorNo}
                      </label>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {count === 0 ? 'Henüz daire seçilmedi.' : `${count} daire seçildi.`}
      </p>
    </fieldset>
  )
}
