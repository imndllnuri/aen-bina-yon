import { Clock, Mail, MapPin, Menu, Phone } from 'lucide-react'
import { useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router'
import { BrandLogo } from '@/components/BrandLogo'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { site } from '@/config/site'
import { cn } from '@/lib/utils'

const links = [
  { to: '/hizmetler', label: 'Hizmetler' },
  { to: '/iletisim', label: 'İletişim' },
]

function DemoBadge() {
  if (!site.demo) return null
  return (
    <Badge variant="outline" className="border-highlight text-foreground" title="Bu site deneme sürümüdür.">
      Demo
    </Badge>
  )
}

export function PublicLayout() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="flex min-h-svh flex-col">
      <div className="hidden bg-brand text-brand-foreground sm:block">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-1.5 text-xs">
          <a href={`tel:${site.phone.replace(/\s/g, '')}`} className="flex items-center gap-1.5 hover:underline">
            <Phone className="size-3.5" aria-hidden="true" /> {site.phone}
          </a>
          <span className="flex items-center gap-1.5">
            <Clock className="size-3.5" aria-hidden="true" /> {site.workingHours}
          </span>
        </div>
      </div>

      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
          <BrandLogo />
          <DemoBadge />

          <nav aria-label="Ana menü" className="ml-6 hidden items-center gap-1 md:flex">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  cn(
                    'rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-muted',
                    isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                  )
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <Button asChild variant="outline" className="hidden sm:inline-flex">
              <Link to="/teklif-al">Teklif Al</Link>
            </Button>
            <Button asChild className="hidden sm:inline-flex">
              <Link to="/giris">Online İşlemler</Link>
            </Button>

            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden" aria-label="Menüyü aç">
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent side="right">
                <SheetHeader>
                  <SheetTitle>{site.shortName}</SheetTitle>
                  <SheetDescription>{site.slogan}</SheetDescription>
                </SheetHeader>
                <nav aria-label="Mobil menü" className="flex flex-col gap-1 px-4">
                  {[...links, { to: '/teklif-al', label: 'Teklif Al' }, { to: '/giris', label: 'Online İşlemler' }].map(
                    (link) => (
                      <Link
                        key={link.to}
                        to={link.to}
                        onClick={() => setMenuOpen(false)}
                        className="rounded-lg px-3 py-3 text-base font-medium hover:bg-muted"
                      >
                        {link.label}
                      </Link>
                    ),
                  )}
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t bg-card">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-3">
            <BrandLogo />
            <p className="max-w-xs text-sm text-muted-foreground">{site.slogan}</p>
          </div>

          <div className="space-y-2 text-sm">
            <h2 className="font-display text-sm font-semibold">İletişim</h2>
            <p className="flex items-start gap-2 text-muted-foreground">
              <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> {site.address}
            </p>
            <p className="flex items-center gap-2 text-muted-foreground">
              <Phone className="size-4 shrink-0" aria-hidden="true" /> {site.phone}
            </p>
            <p className="flex items-center gap-2 text-muted-foreground">
              <Mail className="size-4 shrink-0" aria-hidden="true" /> {site.email}
            </p>
          </div>

          <div className="space-y-2 text-sm">
            <h2 className="font-display text-sm font-semibold">Banka Hesapları</h2>
            {site.bankAccounts.map((account) => (
              <div key={account.iban} className="text-muted-foreground">
                <p className="font-medium text-foreground">{account.bank}</p>
                <p>{account.holder}</p>
                <p className="tabular-nums">{account.iban}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="border-t">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <p>
              © {new Date().getFullYear()} {site.name}. Tüm hakları saklıdır.
              {site.demo && ' Bu site deneme (demo) sürümüdür; gerçek kişisel veri girmeyin.'}
            </p>
            <nav aria-label="Yasal">
              <Link to="/kvkk" className="hover:text-foreground hover:underline">
                KVKK Aydınlatma Metni
              </Link>
            </nav>
          </div>
        </div>
      </footer>
    </div>
  )
}
