import type { LucideIcon } from 'lucide-react'
import { IconCircle } from '@/components/IconCircle'
import { Card, CardContent } from '@/components/ui/card'

/** An honest "not yet" for a part of the home page that a later slice builds. No dead buttons. */
export function ComingSoonCard({ icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return (
    <Card size="sm">
      <CardContent className="flex items-start gap-3">
        <IconCircle icon={icon} />
        <div>
          <h2 className="font-medium">{title}</h2>
          <p className="text-sm text-muted-foreground">{text}</p>
        </div>
      </CardContent>
    </Card>
  )
}
