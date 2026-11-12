import { useState } from 'react'
import { useNavigate } from 'react-router'
import { ErrorBlock, LoadingBlock } from '@/components/StateBlocks'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { todayIstanbul } from '@/lib/format'
import { formatKurus } from '@/lib/money'
import type { MyUnit } from './api'
import { LineList } from './components/LineList'
import { ResidentGate } from './components/ResidentGate'
import { StatementView } from './components/StatementView'
import { linesForTab, tabCounts, TAB_LABEL, type DebtTab } from './lib/ledger'
import { selectionKurus } from './lib/payment'
import { useBalance, useLedger, useMyName } from './queries'

const EMPTY: Record<DebtTab, string> = {
  unpaid: 'Harika! Ödenmemiş borcunuz yok.',
  upcoming: 'Yaklaşan bir borç yok.',
  paid: 'Henüz ödenmiş borç yok. Ödeme yaptığınızda burada görünür.',
  all: 'Henüz adınıza borç yazılmamış.',
}

const TABS: DebtTab[] = ['unpaid', 'upcoming', 'paid', 'all']

function DebtsContent({ unit }: { unit: MyUnit }) {
  const ledger = useLedger(unit.unitId)
  const balance = useBalance(unit.unitId)
  const name = useMyName()
  const navigate = useNavigate()
  const today = todayIstanbul()
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())

  if (ledger.isPending) return <LoadingBlock />
  if (ledger.isError) return <ErrorBlock text="Borçlarınız şu anda yüklenemedi. Lütfen tekrar deneyin." onRetry={() => void ledger.refetch()} />

  const counts = tabCounts(ledger.data, today)
  const toggle = (id: string, on: boolean) =>
    setSelected((current) => {
      const next = new Set(current)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  // Only lines that still owe money and are still in the list can be paid (a list that reloaded may have lost some).
  const payable = ledger.data.filter((line) => line.remainingKurus > 0 && selected.has(line.id))
  const dueNow = linesForTab(ledger.data, 'unpaid', today)
  const total = selectionKurus(payable, new Set(payable.map((l) => l.id)))

  return (
    <Tabs defaultValue="unpaid">
      <TabsList className="w-full flex-wrap justify-start gap-1 p-1 group-data-horizontal/tabs:h-auto print:hidden">
        {TABS.map((tab) => (
          <TabsTrigger key={tab} value={tab} className="h-8 flex-none px-3">
            {TAB_LABEL[tab]} ({counts[tab]})
          </TabsTrigger>
        ))}
        <TabsTrigger value="statement" className="h-8 flex-none px-3">
          Ekstre
        </TabsTrigger>
      </TabsList>
      {TABS.map((tab) => (
        <TabsContent key={tab} value={tab} className="space-y-3 pt-3">
          {tab === 'unpaid' && dueNow.length > 1 && (
            <Button variant="outline" size="sm" onClick={() => setSelected(new Set(dueNow.map((l) => l.id)))}>
              Vadesi gelenlerin hepsini seç
            </Button>
          )}
          <LineList lines={linesForTab(ledger.data, tab, today)} emptyText={EMPTY[tab]} selected={selected} onToggle={toggle} />
        </TabsContent>
      ))}
      <TabsContent value="statement" className="pt-3">
        <StatementView unit={unit} name={name.data ?? null} lines={ledger.data} balanceKurus={balance.data?.balanceKurus ?? null} />
      </TabsContent>

      {payable.length > 0 && (
        <div className="sticky bottom-20 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3 shadow-lg md:bottom-4 print:hidden">
          <p className="text-sm" aria-live="polite">
            <span className="font-semibold">{payable.length}</span> borç seçildi · <span className="font-semibold">{formatKurus(total)}</span>
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setSelected(new Set())}>
              Temizle
            </Button>
            <Button onClick={() => navigate('/odeme', { state: { chargeIds: payable.map((l) => l.id) } })}>Seçilenleri Öde ({formatKurus(total)})</Button>
          </div>
        </div>
      )}
    </Tabs>
  )
}

/** Borçlarım: the lines in four tabs, the statement (ekstre), and "pay the selected ones". */
export function DebtsPage() {
  return (
    <ResidentGate title="Borçlarım" description="Daireniz için yazılan borçlar. Ödemek istediklerinizi seçin.">
      {/* key: a different unit starts with an empty selection */}
      {(unit) => <DebtsContent key={unit.unitId} unit={unit} />}
    </ResidentGate>
  )
}
