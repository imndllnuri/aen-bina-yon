import { Badge } from '@/components/ui/badge'
import type { PaymentStatus, NoticeStatus } from '../lib/notices'
import { noticeStatusInfo } from '../lib/notices'

const VARIANT = { waiting: 'default', good: 'secondary', bad: 'destructive', neutral: 'outline' } as const

export function NoticeStatusBadge({ status, paymentStatus }: { status: NoticeStatus; paymentStatus: PaymentStatus | null }) {
  const info = noticeStatusInfo(status, paymentStatus)
  return <Badge variant={VARIANT[info.tone]}>{info.label}</Badge>
}
