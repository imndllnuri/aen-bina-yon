import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { monthLabel } from '@/lib/format'
import { formatKurus } from '@/lib/money'
import type { MonthRow } from '../api'
import { barPercent, compactTRY, monthTick, niceMax, ticksFor } from '../lib/chart'

/**
 * Month by month: accrued (tahakkuk) and collected (tahsil edilen), as columns on ONE axis. A legend names the two colours,
 * hovering or focusing a month shows both amounts, and "Tabloyu göster" gives the same numbers as a table (for screen readers
 * and for anyone who wants the exact figures). Columns are at most 24 px wide with a 4 px rounded top.
 */
export function MonthlyChart({ rows }: { rows: MonthRow[] }) {
  const [active, setActive] = useState<number | null>(null)
  const [asTable, setAsTable] = useState(false)
  const scale = niceMax(Math.max(0, ...rows.flatMap((r) => [r.accruedKurus, r.collectedKurus])))
  const ticks = ticksFor(scale)
  const first = rows[0]?.month
  const shown = active === null ? null : (rows[active] ?? null)

  return (
    <figure className="space-y-3" aria-label="Son aylarda tahakkuk ve tahsilat">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
        <span className="inline-flex items-center gap-2">
          <span className="size-3 rounded-[3px]" style={{ background: 'var(--viz-1)' }} aria-hidden="true" /> Tahakkuk (o ayın borçları)
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="size-3 rounded-[3px]" style={{ background: 'var(--viz-2)' }} aria-hidden="true" /> Tahsil edilen (o ay alınan ödemeler)
        </span>
        <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={() => setAsTable((v) => !v)} aria-pressed={asTable}>
          {asTable ? 'Grafiği göster' : 'Tabloyu göster'}
        </Button>
      </div>

      {asTable ? (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <caption className="sr-only">Aylara göre tahakkuk ve tahsilat</caption>
            <thead className="bg-muted/50 text-left">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Ay</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Tahakkuk</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Tahsil edilen</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.month}>
                  <th scope="row" className="px-3 py-2 text-left font-normal">{monthLabel(r.month)}</th>
                  <td className="px-3 py-2 text-right tabular-nums">{formatKurus(r.accruedKurus)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatKurus(r.collectedKurus)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex gap-2">
          <div className="relative h-56 w-12 shrink-0 text-right text-[11px] text-muted-foreground" aria-hidden="true">
            {ticks.map((t, i) => (
              <span key={t} className="absolute right-0 -translate-y-1/2 tabular-nums" style={{ bottom: `${i * 25}%` }}>
                {compactTRY(t)}
              </span>
            ))}
          </div>
          <div className="min-w-0 flex-1">
            <div className="relative h-56">
              {/* hairline grid, one step off the surface */}
              {ticks.map((t, i) => (
                <div key={t} className="absolute inset-x-0 border-t border-border" style={{ bottom: `${i * 25}%` }} aria-hidden="true" />
              ))}
              <div className="absolute inset-0 flex items-end">
                {rows.map((r, i) => (
                  <div
                    key={r.month}
                    role="group"
                    tabIndex={0}
                    aria-label={`${monthLabel(r.month)}: tahakkuk ${formatKurus(r.accruedKurus)}, tahsil edilen ${formatKurus(r.collectedKurus)}`}
                    className="relative flex h-full flex-1 items-end justify-center gap-0.5 rounded-sm outline-none focus-visible:bg-muted/50 hover:bg-muted/40"
                    onMouseEnter={() => setActive(i)}
                    onMouseLeave={() => setActive((a) => (a === i ? null : a))}
                    onFocus={() => setActive(i)}
                    onBlur={() => setActive((a) => (a === i ? null : a))}
                  >
                    <div className="w-full max-w-6 rounded-t-[4px]" style={{ height: `${barPercent(r.accruedKurus, scale)}%`, background: 'var(--viz-1)' }} data-testid="bar-accrued" />
                    <div className="w-full max-w-6 rounded-t-[4px]" style={{ height: `${barPercent(r.collectedKurus, scale)}%`, background: 'var(--viz-2)' }} data-testid="bar-collected" />
                  </div>
                ))}
              </div>
              {shown && (
                <div role="status" className="pointer-events-none absolute left-1/2 top-0 z-10 w-56 -translate-x-1/2 rounded-lg border bg-popover p-2.5 text-xs shadow-md">
                  <div className="mb-1 font-medium">{monthLabel(shown.month)}</div>
                  <div className="flex justify-between gap-3"><span>Tahakkuk</span><span className="tabular-nums">{formatKurus(shown.accruedKurus)}</span></div>
                  <div className="flex justify-between gap-3"><span>Tahsil edilen</span><span className="tabular-nums">{formatKurus(shown.collectedKurus)}</span></div>
                </div>
              )}
            </div>
            <div className="mt-1 flex" aria-hidden="true">
              {rows.map((r) => (
                <span key={r.month} className="flex-1 text-center text-[10px] text-muted-foreground">
                  {monthTick(r.month, r.month === first || r.month.slice(5, 7) === '01')}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </figure>
  )
}
