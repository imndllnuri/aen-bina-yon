import { Construction } from 'lucide-react'
import { IconCircle } from '@/components/IconCircle'

/** Stands in for a page that a later feature slice will build. */
export function PlaceholderPage({ title, description }: { title: string; description?: string }) {
  return (
    <section className="mx-auto flex max-w-2xl flex-col items-start gap-4 px-4 py-12 sm:py-16">
      <IconCircle icon={Construction} />
      <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
      <p className="text-muted-foreground">
        {description ?? 'Bu sayfa yapım aşamasında. Yakında burada olacak.'}
      </p>
    </section>
  )
}
