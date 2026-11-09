import { Printer } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDate, todayIstanbul } from '@/lib/format'
import { formatKurus } from '@/lib/money'
import type { MyUnit } from '../api'
import { statementFor, yearRange, type LedgerLine } from '../lib/ledger'
import { relationLabel, unitLabel } from '../lib/unit-label'

const isDate = (text: string) => /^\d{4}-\d{2}-\d{2}$/.test(text)

/**
 * The statement (ekstre) for a date range: the debt before, every line, the debt after.
 * The running balance comes from the database. "Yazdır" uses the browser print dialog, which can also
 * save a PDF (the layout hides the menus when printing).
 */
export function StatementView({ unit, name, lines, balanceKurus }: { unit: MyUnit; name: string | null; lines: LedgerLine[]; balanceKurus: number | null }) {
  const today = todayIstanbul()
  const [range, setRange] = useState(() => yearRange(today))
  const valid = isDate(range.from) && isDate(range.to) && range.from <= range.to
  const statement = valid ? statementFor(lines, range.from, range.to) : null

  return (
    <section aria-label="Hesap ekstresi" className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <div className="space-y-1.5">
          <Label htmlFor="stmt-from">Başlangıç</Label>
          <Input id="stmt-from" type="date" value={range.from} onChange={(event) => setRange({ ...range, from: event.target.value })} className="h-10 w-44" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="stmt-to">Bitiş</Label>
          <Input id="stmt-to" type="date" value={range.to} onChange={(event) => setRange({ ...range, to: event.target.value })} className="h-10 w-44" />
        </div>
        <Button variant="outline" onClick={() => window.print()} disabled={!statement}>
          <Printer /> Yazdır / PDF
        </Button>
      </div>

      {!statement && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
          Başlangıç tarihi bitiş tarihinden önce olmalı. İki tarihi de seçin.
        </p>
      )}

      {statement && (
        <div className="space-y-3">
          <div className="space-y-0.5 text-sm">
            <h2 className="text-lg font-semibold">Hesap Ekstresi</h2>
            <p>
              {unit.siteName} · {unitLabel(unit)} · {relationLabel(unit)}
            </p>
            {name && <p>{name}</p>}
            <p className="text-muted-foreground">
              Dönem: {formatDate(range.from)} – {formatDate(range.to)} · Düzenlenme: {formatDate(today)}
            </p>
          </div>

          <div className="overflow-x-auto rounded-lg border print:border-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Açıklama</TableHead>
                  <TableHead className="text-right">Tutar</TableHead>
                  <TableHead className="text-right">Bakiye</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow className="bg-muted/40">
                  <TableCell colSpan={2} className="font-medium">
                    Devreden bakiye
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{formatKurus(statement.openingKurus)}</TableCell>
                </TableRow>
                {statement.rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-muted-foreground">
                      Bu tarih aralığında borç yok.
                    </TableCell>
                  </TableRow>
                )}
                {statement.rows.map((line) => (
                  <TableRow key={line.id}>
                    <TableCell className="whitespace-normal">
                      <div>
                        {line.typeName}
                        {line.description && <span className="text-muted-foreground"> · {line.description}</span>}
                      </div>
                      <div className="text-xs text-muted-foreground">Son ödeme: {formatDate(line.dueDate)}</div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatKurus(line.amountKurus)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatKurus(line.runningKurus)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={2} className="font-semibold">
                    Dönem sonu bakiye
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{formatKurus(statement.closingKurus)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
          {balanceKurus !== null && (
            <p className="text-sm text-muted-foreground">
              Bugünkü toplam borç: <span className="font-medium text-foreground">{formatKurus(balanceKurus)}</span>
            </p>
          )}
        </div>
      )}
    </section>
  )
}
