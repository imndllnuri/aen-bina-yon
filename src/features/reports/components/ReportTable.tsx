import { cn } from '@/lib/utils'
import { formatCell, isNumeric } from '../lib/sheets'
import type { XCell, XSheet } from '../lib/xlsx'

function Cell({ cell, bold, first }: { cell: XCell; bold?: boolean; first?: boolean }) {
  return (
    <td className={cn('px-3 py-2', (isNumeric(cell) || first) && 'whitespace-nowrap', isNumeric(cell) && 'text-right tabular-nums', bold && 'font-semibold')}>
      {formatCell(cell) || (cell.t === 'str' || cell.t === 'blank' ? '' : '—')}
    </td>
  )
}

/** A report drawn as a table: the same cells that go into the Excel file. Prints cleanly (borders, small type). */
export function ReportTable({ sheet, caption, emptyText }: { sheet: XSheet; caption: string; emptyText: string }) {
  if (sheet.rows.length === 0) {
    return (
      <p role="status" className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        {emptyText}
      </p>
    )
  }
  return (
    <div className="relative overflow-x-auto rounded-lg border print:overflow-visible print:rounded-none print:border-0">
      <table className="w-full text-sm print:text-[11px]">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-muted/50 text-left">
          <tr>
            {sheet.head.map((text, i) => {
              const sample = sheet.rows[0]?.[i]
              return (
                <th key={text} scope="col" className={cn('px-3 py-2 font-medium', isNumeric(sample) && 'text-right')}>
                  {text}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody className="divide-y">
          {sheet.rows.map((row, r) => (
            <tr key={r} className="print:break-inside-avoid">
              {row.map((cell, c) => (
                <Cell key={c} cell={cell} first={c === 0} />
              ))}
            </tr>
          ))}
        </tbody>
        {sheet.total && (
          <tfoot className="border-t-2 bg-muted/30">
            <tr>
              {sheet.total.map((cell, c) => (
                <Cell key={c} cell={cell} bold first={c === 0} />
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}
