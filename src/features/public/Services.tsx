import { Check } from 'lucide-react'
import { Link } from 'react-router'
import { IconCircle } from '@/components/IconCircle'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { services } from './services-data'

export function Services() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-12 sm:py-16">
      <h1 className="text-2xl font-bold sm:text-3xl">Hizmetlerimiz</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Bina ve site yönetiminin tüm işlerini tek çatı altında topluyoruz. Sakinler için kolay, yönetim için düzenli.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {services.map((service) => (
          <Card key={service.title}>
            <CardHeader>
              <IconCircle icon={service.icon} />
              <CardTitle className="mt-2 text-base">{service.title}</CardTitle>
              <CardDescription>{service.text}</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                {service.points.map((point) => (
                  <li key={point} className="flex items-start gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-10 flex flex-col items-start gap-3 rounded-xl border bg-card p-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-display text-lg font-semibold">Binanız için ücretsiz teklif alın</p>
        <Button asChild size="lg" className="h-11 px-5 text-base">
          <Link to="/teklif-al">Teklif Al</Link>
        </Button>
      </div>
    </section>
  )
}
