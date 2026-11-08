import {
  Building2,
  ChartColumn,
  CreditCard,
  FileText,
  House,
  Landmark,
  LogOut,
  Megaphone,
  Menu,
  Settings,
  Users,
  Wallet,
  Wrench,
} from 'lucide-react'
import { useState } from 'react'
import { Outlet } from 'react-router'
import { BrandLogo } from '@/components/BrandLogo'
import { SidebarNav, type NavGroup } from '@/components/nav/SidebarNav'
import { SignedInAs } from '@/components/SignedInAs'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { site } from '@/config/site'
import { useSignOut } from '@/lib/auth'

// Sidebar groups from the plan (section 8). Only the pages that exist in Faz 1 are listed.
const groups: NavGroup[] = [
  { items: [{ to: '/yonetim', label: 'Genel Bakış', icon: House, end: true }] },
  { title: 'Yapı', items: [{ to: '/yonetim/daireler', label: 'Daireler', icon: Building2 }] },
  { title: 'Kişiler', items: [{ to: '/yonetim/sakinler', label: 'Sakinler', icon: Users }] },
  {
    title: 'Finans',
    items: [
      { to: '/yonetim/borclandirma', label: 'Borçlandırma', icon: Wallet },
      { to: '/yonetim/tahsilatlar', label: 'Tahsilatlar', icon: CreditCard },
      { to: '/yonetim/havale-onaylari', label: 'Havale Onayları', icon: Landmark },
      { to: '/yonetim/raporlar', label: 'Raporlar', icon: ChartColumn },
    ],
  },
  { title: 'İletişim', items: [{ to: '/yonetim/duyurular', label: 'Duyurular', icon: Megaphone }] },
  { title: 'Operasyon', items: [{ to: '/yonetim/talepler', label: 'Talepler', icon: Wrench }] },
  {
    title: 'Sistem',
    items: [
      { to: '/yonetim/teklif-talepleri', label: 'Teklif Talepleri', icon: FileText },
      { to: '/yonetim/ayarlar', label: 'Ayarlar', icon: Settings },
    ],
  },
]

export function AdminLayout() {
  const [menuOpen, setMenuOpen] = useState(false)
  const signOut = useSignOut()

  return (
    <div className="flex min-h-svh">
      <aside className="hidden w-64 shrink-0 flex-col gap-6 overflow-y-auto border-r bg-sidebar p-4 lg:flex">
        <BrandLogo to="/yonetim" />
        <SidebarNav groups={groups} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Menüyü aç">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="overflow-y-auto">
              <SheetHeader>
                <SheetTitle>{site.shortName}</SheetTitle>
                <SheetDescription>Yönetim Paneli</SheetDescription>
              </SheetHeader>
              <div className="px-4 pb-6">
                <SidebarNav groups={groups} onNavigate={() => setMenuOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>

          <span className="font-display text-sm font-semibold">Yönetim Paneli</span>
          {site.demo && (
            <Badge variant="outline" className="border-highlight text-foreground">
              Demo
            </Badge>
          )}
          <div className="ml-auto flex items-center gap-1">
            <SignedInAs />
            <ThemeToggle />
            <Button variant="ghost" onClick={() => void signOut()}>
              <LogOut /> Çıkış
            </Button>
          </div>
        </header>

        <main className="flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
