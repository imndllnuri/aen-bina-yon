import { Megaphone, Receipt, Wrench } from 'lucide-react'
import { Link } from 'react-router'
import { ErrorBlock, LoadingBlock } from '@/components/StateBlocks'
import { Button } from '@/components/ui/button'
import type { MyUnit } from './api'
import { BalanceCard } from './components/BalanceCard'
import { ComingSoonCard } from './components/ComingSoonCard'
import { LineList } from './components/LineList'
import { ResidentGate } from './components/ResidentGate'
import { firstName, nextThree } from './lib/ledger'
import { useLedger, useMyName } from './queries'

function PanelContent({ unit }: { unit: MyUnit }) {
  const name = useMyName()
  const ledger = useLedger(unit.unitId)
  const first = firstName(name.data ?? null)

  return (
    <>
      <p className="text-lg font-medium">{first ? `Merhaba, ${first}` : 'Merhaba'}</p>

      <BalanceCard unitId={unit.unitId} />

      <section aria-labelledby="next-heading" className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id="next-heading" className="text-lg font-semibold">
            Sıradaki borçlar
          </h2>
          <Button asChild variant="ghost" size="sm">
            <Link to="/borclarim">Tümünü gör</Link>
          </Button>
        </div>
        {ledger.isPending && <LoadingBlock />}
        {ledger.isError && <ErrorBlock text="Borçlarınız şu anda yüklenemedi. Lütfen tekrar deneyin." onRetry={() => void ledger.refetch()} />}
        {ledger.data && <LineList lines={nextThree(ledger.data)} emptyText="Harika! Ödenmemiş borcunuz yok." />}
      </section>

      <div className="grid gap-3 sm:grid-cols-1">
        <ComingSoonCard icon={Receipt} title="Son ödemeler" text="Online ödeme açıldığında ödemeleriniz ve makbuzlarınız burada görünecek." />
        <ComingSoonCard icon={Megaphone} title="Duyurular" text="Site yönetiminin duyuruları yakında burada olacak." />
        <ComingSoonCard icon={Wrench} title="Taleplerim" text="Arıza ve istek bildirimi yakında burada olacak." />
      </div>
    </>
  )
}

/** Ana Sayfa: "Ne kadar borcum var?" in under 10 seconds (plan, section 7). */
export function PanelPage() {
  return <ResidentGate title="Ana Sayfa">{(unit) => <PanelContent unit={unit} />}</ResidentGate>
}
