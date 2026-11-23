import { Wrench } from 'lucide-react'
import { Link } from 'react-router'
import { IconCircle } from '@/components/IconCircle'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { StatusBadge } from '@/features/requests/components/Badges'
import { isOpenStatus } from '@/features/requests/lib/catalog'
import { useMyRequests } from '@/features/requests/queries'

/** "Taleplerim" on the home page: the requests that are still open (latest three) and a way to report a new problem. */
export function OpenRequests({ unitId }: { unitId: string }) {
  const requests = useMyRequests()
  const open = (requests.data ?? []).filter((r) => r.unitId === unitId && isOpenStatus(r.status))

  return (
    <Card size="sm">
      <CardContent className="space-y-2">
        <div className="flex items-center gap-3">
          <IconCircle icon={Wrench} />
          <h2 className="flex-1 font-medium">Taleplerim</h2>
          <Button asChild variant="ghost" size="sm">
            <Link to="/taleplerim">Tümünü gör</Link>
          </Button>
        </div>
        {requests.isError && <p className="text-sm text-muted-foreground">Talepleriniz şu anda yüklenemedi.</p>}
        {!requests.isError && !requests.isPending && open.length === 0 && <p className="text-sm text-muted-foreground">Devam eden talebiniz yok.</p>}
        {open.length > 0 && (
          <ul className="divide-y text-sm">
            {open.slice(0, 3).map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 py-1.5">
                <Link to={`/taleplerim/${item.id}`} className="truncate hover:underline">
                  {item.title}
                </Link>
                <StatusBadge status={item.status} />
              </li>
            ))}
          </ul>
        )}
        <Button asChild variant="outline" size="sm">
          <Link to="/taleplerim/yeni">Arıza bildir</Link>
        </Button>
      </CardContent>
    </Card>
  )
}
