import { Loader2 } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { formatDate } from '@/lib/format'
import { formatKurus } from '@/lib/money'
import type { AllocationState, Selection } from '../allocation'
import { lineLabel } from '../lib/lines'
import { transferErrorMessage } from '../lib/notices'

/**
 * Step "Hangi borçlar kapanacak?". Default: oldest due date first (FIFO). The admin may pick the lines instead.
 * The table below shows what the DATABASE says would be closed, line by line, and how much of each.
 */
export function AllocationPicker({
  idPrefix,
  allocation,
  selection,
  onSelectionChange,
  amountKurus,
}: {
  idPrefix: string
  allocation: AllocationState
  selection: Selection
  onSelectionChange: (selection: Selection) => void
  amountKurus: number | null
}) {
  const { candidates, result, loading, error } = allocation
  const toggle = (id: string, on: boolean) => {
    if (selection.mode !== 'pick') return
    const next = new Set(selection.picked)
    if (on) next.add(id)
    else next.delete(id)
    onSelectionChange({ mode: 'pick', picked: next })
  }

  return (
    <fieldset className="space-y-3 rounded-lg border p-3">
      <legend className="px-1 text-sm font-medium">Hangi borçlar kapanacak?</legend>

      {amountKurus === null ? (
        <p className="text-sm text-muted-foreground">Önce daire, ödeyen kişi ve tutarı girin; kapanacak borçlar burada görünür.</p>
      ) : (
        <>
          <div className="space-y-2">
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="radio"
                name={`${idPrefix}-mode`}
                checked={selection.mode === 'fifo'}
                onChange={() => onSelectionChange({ mode: 'fifo' })}
                className="mt-1"
              />
              <span>
                <span className="font-medium">En eski borçtan başla</span> <span className="text-muted-foreground">(önerilen)</span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="radio"
                name={`${idPrefix}-mode`}
                checked={selection.mode === 'pick'}
                onChange={() => onSelectionChange({ mode: 'pick', picked: selection.mode === 'pick' ? selection.picked : new Set() })}
                className="mt-1"
              />
              <span className="font-medium">Borçları ben seçeyim</span>
            </label>
          </div>

          {selection.mode === 'pick' && candidates && candidates.lines.length > 0 && (
            <ul className="space-y-2 rounded-md bg-muted/40 p-2">
              {candidates.lines.map((line) => (
                <li key={line.chargeId} className="flex items-start gap-2">
                  <Checkbox
                    id={`${idPrefix}-line-${line.chargeId}`}
                    checked={selection.picked.has(line.chargeId)}
                    onCheckedChange={(checked) => toggle(line.chargeId, checked === true)}
                    className="mt-0.5"
                  />
                  <Label htmlFor={`${idPrefix}-line-${line.chargeId}`} className="flex-1 cursor-pointer text-sm font-normal leading-snug">
                    {lineLabel(line)} · son ödeme {formatDate(line.dueDate)} · kalan <span className="font-semibold tabular-nums">{formatKurus(line.remainingKurus)}</span>
                  </Label>
                </li>
              ))}
            </ul>
          )}

          {loading && (
            <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Borçlar hesaplanıyor…
            </p>
          )}
          {error !== null && error !== undefined && (
            <p role="alert" className="text-sm text-destructive">
              {transferErrorMessage(error)}
            </p>
          )}

          {candidates && candidates.lines.length === 0 && !loading && (
            <p role="alert" className="text-sm text-destructive">
              Bu kişi için kapatılabilecek açık borç yok.
            </p>
          )}
          {selection.mode === 'pick' && selection.picked.size === 0 && candidates && candidates.lines.length > 0 && (
            <p className="text-sm text-muted-foreground">Kapatmak istediğiniz borçları işaretleyin.</p>
          )}

          {result && result.lines.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Bu ödeme şunları kapatır:</p>
              <ul className="divide-y rounded-md border text-sm" aria-label="Kapanacak borçlar">
                {result.lines
                  .filter((line) => line.applyKurus > 0)
                  .map((line) => (
                    <li key={line.chargeId} className="flex items-center justify-between gap-3 px-3 py-2">
                      <span>
                        {lineLabel(line)}
                        {line.applyKurus < line.remainingKurus && <span className="ml-2 text-xs text-muted-foreground">(kısmi: {formatKurus(line.remainingKurus - line.applyKurus)} kalır)</span>}
                      </span>
                      <span className="font-semibold tabular-nums">{formatKurus(line.applyKurus)}</span>
                    </li>
                  ))}
              </ul>
              {result.excessKurus > 0 && (
                <p role="alert" className="text-sm font-medium text-destructive">
                  Tutar, kapatılabilecek borçtan {formatKurus(result.excessKurus)} fazla. Fazla ödeme (alacak) henüz desteklenmiyor: tutarı düşürün
                  {selection.mode === 'pick' ? ' ya da daha çok borç seçin.' : '.'}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </fieldset>
  )
}
