import { Layers, Plus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { AdminSite } from './api'
import { BatchesTab } from './charges/BatchesTab'
import { ChargesTab } from './charges/ChargesTab'
import { PlansTab } from './charges/PlansTab'
import { BulkChargeDialog } from './components/BulkChargeDialog'
import { SingleChargeDialog } from './components/SingleChargeDialog'
import { SiteGate } from './components/SiteGate'
import { ErrorBlock, LoadingBlock } from './components/StateBlocks'
import { useBlocks, useChargeTypes, useRefreshCharges, useUnits } from './queries'

function BorclandirmaContent({ site }: { site: AdminSite }) {
  const blocks = useBlocks(site.id)
  const units = useUnits(site.id)
  const types = useChargeTypes(site.companyId)
  const refresh = useRefreshCharges(site.id)
  const [single, setSingle] = useState(false)
  const [bulk, setBulk] = useState(false)

  if (blocks.isPending || units.isPending || types.isPending) return <LoadingBlock />
  if (blocks.isError || units.isError || types.isError) {
    return (
      <ErrorBlock
        text="Borçlandırma sayfası şu anda yüklenemedi. Lütfen tekrar deneyin."
        onRetry={() => {
          void blocks.refetch()
          void units.refetch()
          void types.refetch()
        }}
      />
    )
  }
  if (units.data.length === 0) {
    return (
      <p role="status" className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        Bu sitede henüz daire yok. Borç yazmak için önce Daireler sayfasından daire ekleyin.
      </p>
    )
  }
  if (types.data.length === 0) {
    return (
      <p role="status" className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        Bu firmada henüz borç türü yok. Sistem yöneticisiyle iletişime geçin.
      </p>
    )
  }

  const shared = { site, blocks: blocks.data, units: units.data, types: types.data }

  return (
    <>
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => setBulk(true)}>
          <Layers /> Toplu borçlandır
        </Button>
        <Button variant="outline" onClick={() => setSingle(true)}>
          <Plus /> Tek borç ekle
        </Button>
      </div>

      <Tabs defaultValue="charges">
        <TabsList>
          <TabsTrigger value="charges">Borçlar</TabsTrigger>
          <TabsTrigger value="batches">Toplu işlemler</TabsTrigger>
          <TabsTrigger value="plans">Aylık planlar</TabsTrigger>
        </TabsList>
        <TabsContent value="charges" className="pt-3">
          <ChargesTab site={site} blocks={blocks.data} types={types.data} />
        </TabsContent>
        <TabsContent value="batches" className="pt-3">
          <BatchesTab site={site} blocks={blocks.data} />
        </TabsContent>
        <TabsContent value="plans" className="pt-3">
          <PlansTab {...shared} />
        </TabsContent>
      </Tabs>

      <BulkChargeDialog open={bulk} onOpenChange={setBulk} {...shared} onCreated={refresh} />
      <SingleChargeDialog open={single} onOpenChange={setSingle} {...shared} onCreated={refresh} />
    </>
  )
}

/** Borçlandırma: charge lines, bulk operations and monthly plans (plan, section 8). */
export function BorclandirmaPage() {
  return (
    <SiteGate title="Borçlandırma" description="Dairelere borç yazın, aylık aidat planınızı kurun, yanlışları iptal edin. Tutarları veritabanı hesaplar; ekranda gördüğünüz önizleme kaydedilenle aynıdır.">
      {(site) => <BorclandirmaContent site={site} />}
    </SiteGate>
  )
}
