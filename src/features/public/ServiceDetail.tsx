import { ArrowLeft, Check } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { IconCircle } from '@/components/IconCircle'
import { Button } from '@/components/ui/button'
import { NotFound } from '@/features/NotFound'
import { services } from './services-data'

/** One page for one service (/hizmetler/<slug>). An address that no service has shows the normal "not found" page. */
export function ServiceDetail() {
  const { slug } = useParams()
  const service = services.find((s) => s.slug === slug)
  if (!service) return <NotFound />
  const others = services.filter((s) => s.slug !== service.slug)

  return (
    <section className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
      <Link to="/hizmetler" className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline">
        <ArrowLeft className="size-4" aria-hidden="true" /> Tüm hizmetler
      </Link>
      <div className="mt-4 flex items-center gap-4">
        <IconCircle icon={service.icon} />
        <h1 className="text-2xl font-bold sm:text-3xl">{service.title}</h1>
      </div>
      <p className="mt-3 text-lg text-muted-foreground">{service.text}</p>

      <div className="mt-6 space-y-4 leading-relaxed">
        {service.details.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>

      <h2 className="mt-8 font-display text-lg font-semibold">Neler dahil?</h2>
      <ul className="mt-3 space-y-2 text-sm">
        {service.points.map((point) => (
          <li key={point} className="flex items-start gap-2">
            <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
            <span>{point}</span>
          </li>
        ))}
      </ul>

      <div className="mt-10 flex flex-col items-start gap-3 rounded-xl border bg-card p-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-display text-lg font-semibold">Binanız için ücretsiz teklif alın</p>
        <Button asChild size="lg" className="h-11 px-5 text-base">
          <Link to="/teklif-al">Teklif Al</Link>
        </Button>
      </div>

      <h2 className="mt-10 font-display text-lg font-semibold">Diğer hizmetler</h2>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {others.map((other) => (
          <li key={other.slug}>
            <Link to={`/hizmetler/${other.slug}`} className="block rounded-lg border bg-card p-3 text-sm font-medium hover:bg-muted/40">
              {other.title}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
