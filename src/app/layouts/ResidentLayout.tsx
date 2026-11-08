import {
  CreditCard,
  House,
  Landmark,
  LogOut,
  Megaphone,
  Receipt,
  User,
  Wallet,
  Wrench,
} from 'lucide-react'
import { NavLink, Outlet } from 'react-router'
import { BrandLogo } from '@/components/BrandLogo'
import { SidebarNav, type NavGroup, type NavItem } from '@/components/nav/SidebarNav'
import { SignedInAs } from '@/components/SignedInAs'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { site } from '@/config/site'
import { useSignOut } from '@/lib/auth'
import { cn } from '@/lib/utils'

const sidebarGroups: NavGroup[] = [
  {
    items: [
      { to: '/panel', label: 'Ana Sayfa', icon: House, end: true },
      { to: '/borclarim', label: 'Borçlarım', icon: Wallet },
      { to: '/odeme', label: 'Ödeme Yap', icon: CreditCard },
      { to: '/odemelerim', label: 'Ödemelerim', icon: Receipt },
      { to: '/havale-bildirimi', label: 'Havale Bildir', icon: Landmark },
      { to: '/duyurular', label: 'Duyurular', icon: Megaphone },
      { to: '/taleplerim', label: 'Taleplerim', icon: Wrench },
      { to: '/profil', label: 'Profil', icon: User },
    ],
  },
]

// Phones get a bottom tab bar with the five most used pages (plan, section 7).
const tabs: NavItem[] = [
  { to: '/panel', label: 'Ana Sayfa', icon: House, end: true },
  { to: '/borclarim', label: 'Borçlarım', icon: Wallet },
  { to: '/odeme', label: 'Öde', icon: CreditCard },
  { to: '/duyurular', label: 'Duyurular', icon: Megaphone },
  { to: '/taleplerim', label: 'Talepler', icon: Wrench },
]

export function ResidentLayout() {
  const signOut = useSignOut()

  return (
    <div className="flex min-h-svh flex-col md:flex-row">
      <aside className="hidden w-64 shrink-0 flex-col gap-6 border-r bg-sidebar p-4 md:flex">
        <BrandLogo to="/panel" />
        <SidebarNav groups={sidebarGroups} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur">
          <div className="md:hidden">
            <BrandLogo to="/panel" />
          </div>
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

        {/* pb-20: keep content clear of the bottom tab bar on phones */}
        <main className="flex-1 pb-20 md:pb-0">
          <Outlet />
        </main>

        <nav
          aria-label="Alt menü"
          className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        >
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                cn(
                  'flex min-h-14 flex-col items-center justify-center gap-0.5 text-[0.7rem] font-medium outline-none',
                  'focus-visible:ring-3 focus-visible:ring-ring/50',
                  isActive ? 'text-primary' : 'text-muted-foreground',
                )
              }
            >
              <tab.icon className="size-5" aria-hidden="true" />
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  )
}
