import {
  ChartColumn,
  CreditCard,
  FileText,
  Landmark,
  Megaphone,
  ShieldCheck,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { Link } from 'react-router'
import { IconCircle } from '@/components/IconCircle'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { site } from '@/config/site'

const quickActions: { to: string; label: string; icon: LucideIcon }[] = [
  { to: '/odeme', label: 'Aidat Öde', icon: CreditCard },
  { to: '/havale-bildirimi', label: 'Havale Bildir', icon: Landmark },
  { to: '/taleplerim', label: 'Arıza Bildir', icon: Wrench },
  { to: '/teklif-al', label: 'Teklif Al', icon: FileText },
]

const services: { title: string; text: string; icon: LucideIcon }[] = [
  { title: 'Aidat ve Tahsilat', text: 'Aidat takibi, çevrimiçi ödeme ve otomatik makbuz.', icon: CreditCard },
  { title: 'Muhasebe ve Raporlama', text: 'Gelir, gider ve kasa raporları her an elinizin altında.', icon: ChartColumn },
  { title: 'Duyuru ve İletişim', text: 'Tüm sakinlere ya da seçtiğiniz bloğa anında duyuru.', icon: Megaphone },
  { title: 'Arıza ve Talep Takibi', text: 'Talepler fotoğrafla açılır, durumu adım adım izlenir.', icon: Wrench },
  { title: 'Belge ve Karar Yönetimi', text: 'Kararlar, sözleşmeler ve tutanaklar tek yerde saklanır.', icon: FileText },
  { title: 'Güvenlik ve KVKK', text: 'Verileriniz KVKK’ya uygun ve yetkiye göre korunur.', icon: ShieldCheck },
]

const steps = [
  { title: 'Giriş yap', text: 'Yönetimin gönderdiği davetle şifrenizi belirleyin.' },
  { title: 'Borcunu gör', text: 'Güncel borç, geçmiş ödemeler ve ekstre tek ekranda.' },
  { title: 'Güvenle öde', text: 'Kartla ya da havale bildirimiyle ödeyin, makbuzunuzu indirin.' },
]

export function Home() {
  return (
    <>
      <section className="bg-gradient-to-br from-brand-deep to-brand text-brand-foreground">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
          <h1 className="max-w-2xl text-3xl font-extrabold text-balance sm:text-5xl">{site.slogan}</h1>
          <p className="mt-4 max-w-xl text-base text-white/85 sm:text-lg">
            Aidat, duyuru ve talepler tek çatı altında. Sakinler için kolay, yönetim için düzenli.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg" className="h-11 bg-highlight px-5 text-base text-highlight-foreground hover:bg-highlight/90">
              <Link to="/giris">Online İşlemler</Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="h-11 border-white/50 bg-transparent px-5 text-base text-white hover:bg-white/10 hover:text-white"
            >
              <Link to="/teklif-al">Teklif Al</Link>
            </Button>
          </div>
          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/90">
            {['Online ödeme', '7/24 erişim', 'KVKK uyumlu'].map((chip) => (
              <li key={chip} className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-highlight" aria-hidden="true" /> {chip}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="hizli-islemler" className="mx-auto -mt-6 max-w-6xl px-4">
        <h2 id="hizli-islemler" className="sr-only">
          Hızlı işlemler
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {quickActions.map((action) => (
            <Link
              key={action.to}
              to={action.to}
              className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm outline-none transition-shadow hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <IconCircle icon={action.icon} />
              <span className="text-sm font-semibold">{action.label}</span>
            </Link>
          ))}
        </div>
      </section>

      <section aria-labelledby="hizmetler" className="mx-auto max-w-6xl px-4 py-16">
        <h2 id="hizmetler" className="text-2xl font-bold sm:text-3xl">
          Hizmetlerimiz
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((service) => (
            <Card key={service.title}>
              <CardHeader>
                <IconCircle icon={service.icon} />
                <CardTitle className="mt-2 text-base">{service.title}</CardTitle>
                <CardDescription>{service.text}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      <section aria-labelledby="nasil-calisir" className="border-y bg-card">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 id="nasil-calisir" className="text-2xl font-bold sm:text-3xl">
            Nasıl çalışır?
          </h2>
          <ol className="mt-8 grid gap-6 sm:grid-cols-3">
            {steps.map((step, index) => (
              <li key={step.title} className="flex gap-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary font-display font-bold text-primary-foreground">
                  {index + 1}
                </span>
                <div>
                  <h3 className="font-semibold">{step.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="bg-brand text-brand-foreground">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-4 px-4 py-12 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xl font-bold sm:text-2xl">Binanız için ücretsiz teklif alın</h2>
          <Button asChild size="lg" className="h-11 bg-highlight px-5 text-base text-highlight-foreground hover:bg-highlight/90">
            <Link to="/teklif-al">Teklif Al</Link>
          </Button>
        </div>
      </section>
    </>
  )
}
