import { Clock, Mail, MapPin, MessageCircle, Phone } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { IconCircle } from '@/components/IconCircle'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { site } from '@/config/site'

function ContactRow({ icon, title, children }: { icon: typeof Phone; title: string; children: ReactNode }) {
  return (
    <Card>
      <CardContent className="flex items-start gap-4">
        <IconCircle icon={icon} />
        <div className="min-w-0 text-sm">
          <h2 className="font-display text-base font-semibold">{title}</h2>
          <div className="mt-1 text-muted-foreground">{children}</div>
        </div>
      </CardContent>
    </Card>
  )
}

export function Contact() {
  const tel = `tel:${site.phone.replace(/\s/g, '')}`
  return (
    <section className="mx-auto max-w-4xl px-4 py-12 sm:py-16">
      <h1 className="text-2xl font-bold sm:text-3xl">İletişim</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Sorularınız için bize telefonla, WhatsApp ile ya da e-posta ile ulaşabilirsiniz.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <ContactRow icon={Phone} title="Telefon">
          <a href={tel} className="font-medium text-foreground hover:underline">
            {site.phone}
          </a>
        </ContactRow>
        <ContactRow icon={MessageCircle} title="WhatsApp">
          <a
            href={`https://wa.me/${site.whatsapp}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-foreground hover:underline"
          >
            WhatsApp ile yazın
          </a>
        </ContactRow>
        <ContactRow icon={Mail} title="E-posta">
          <a href={`mailto:${site.email}`} className="font-medium text-foreground hover:underline">
            {site.email}
          </a>
        </ContactRow>
        <ContactRow icon={Clock} title="Çalışma saatleri">
          {site.workingHours}
        </ContactRow>
        <div className="sm:col-span-2">
          <ContactRow icon={MapPin} title="Adres">
            {site.address}
          </ContactRow>
        </div>
      </div>

      <div className="mt-10">
        <Button asChild size="lg" className="h-11 px-5 text-base">
          <Link to="/teklif-al">Teklif Al</Link>
        </Button>
      </div>
    </section>
  )
}
