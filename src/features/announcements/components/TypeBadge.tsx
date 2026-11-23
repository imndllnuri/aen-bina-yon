import { Badge } from '@/components/ui/badge'
import { typeLabel, typeVariant } from '../lib/state'

export function TypeBadge({ type }: { type: string }) {
  return <Badge variant={typeVariant(type)}>{typeLabel(type)}</Badge>
}
