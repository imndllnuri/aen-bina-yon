import { ErrorBlock, LoadingBlock } from '@/components/StateBlocks'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { todayIstanbul } from '@/lib/format'
import type { MyUnit } from './api'
import { LineList } from './components/LineList'
import { ResidentGate } from './components/ResidentGate'
import { StatementView } from './components/StatementView'
import { linesForTab, tabCounts, TAB_LABEL, type DebtTab } from './lib/ledger'
import { useBalance, useLedger, useMyName } from './queries'

const EMPTY: Record<DebtTab, string> = {
  unpaid: 'Harika! Ödenmemiş borcunuz yok.',
  upcoming: 'Yaklaşan bir borç yok.',
  paid: 'Henüz ödenmiş borç yok. Online ödeme açıldığında ödemeleriniz burada görünecek.',
  all: 'Henüz adınıza borç yazılmamış.',
}

const TABS: DebtTab[] = ['unpaid', 'upcoming', 'paid', 'all']

function DebtsContent({ unit }: { unit: MyUnit }) {
  const ledger = useLedger(unit.unitId)
  const balance = useBalance(unit.unitId)
  const name = useMyName()
  const today = todayIstanbul()

  if (ledger.isPending) return <LoadingBlock />
  if (ledger.isError) return <ErrorBlock text="Borçlarınız şu anda yüklenemedi. Lütfen tekrar deneyin." onRetry={() => void ledger.refetch()} />

  const counts = tabCounts(ledger.data, today)

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
        <TabsContent key={tab} value={tab} className="pt-3">
          <LineList lines={linesForTab(ledger.data, tab, today)} emptyText={EMPTY[tab]} />
        </TabsContent>
      ))}
      <TabsContent value="statement" className="pt-3">
        <StatementView unit={unit} name={name.data ?? null} lines={ledger.data} balanceKurus={balance.data?.balanceKurus ?? null} />
      </TabsContent>
    </Tabs>
  )
}

/** Borçlarım: the lines in four tabs, and the statement (ekstre). Paying arrives with slice 6. */
export function DebtsPage() {
  return (
    <ResidentGate title="Borçlarım" description="Daireniz için yazılan borçlar. Ödeme özelliği çok yakında.">
      {(unit) => <DebtsContent unit={unit} />}
    </ResidentGate>
  )
}
