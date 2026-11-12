import type { RouteObject } from 'react-router'
import { AdminLayout } from '@/app/layouts/AdminLayout'
import { PublicLayout } from '@/app/layouts/PublicLayout'
import { ResidentLayout } from '@/app/layouts/ResidentLayout'
import { PlaceholderPage } from '@/components/PlaceholderPage'
import { ForgotPassword } from '@/features/auth/ForgotPassword'
import { Login } from '@/features/auth/Login'
import { SetPassword } from '@/features/auth/SetPassword'
import { BorclandirmaPage } from '@/features/admin/BorclandirmaPage'
import { AdminPaymentsPage } from '@/features/admin/PaymentsPage'
import { ResidentsPage } from '@/features/admin/ResidentsPage'
import { UnitsPage } from '@/features/admin/UnitsPage'
import { NotFound } from '@/features/NotFound'
import { CheckoutPage } from '@/features/resident/CheckoutPage'
import { DebtsPage } from '@/features/resident/DebtsPage'
import { PanelPage } from '@/features/resident/PanelPage'
import { PaymentResultPage } from '@/features/resident/PaymentResultPage'
import { PaymentsPage } from '@/features/resident/PaymentsPage'
import { ThreeDSecurePage } from '@/features/resident/ThreeDSecurePage'
import { Contact } from '@/features/public/Contact'
import { Home } from '@/features/public/Home'
import { Kvkk } from '@/features/public/Kvkk'
import { Quote } from '@/features/public/Quote'
import { Services } from '@/features/public/Services'
import { RequireRole } from '@/lib/auth-guard'

// Every page that a later feature slice will build is a placeholder for now.
const page = (title: string, description?: string) => <PlaceholderPage title={title} description={description} />

/**
 * Route table (plan, section 15, step 8). Kept separate from the router so tests can
 * run the same routes in memory. Hash routing means no server rewrites are needed on
 * GitHub Pages: refreshing /#/borclarim always loads index.html.
 */
export const routes: RouteObject[] = [
  {
    element: <PublicLayout />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/hizmetler', element: <Services /> },
      { path: '/teklif-al', element: <Quote /> },
      { path: '/iletisim', element: <Contact /> },
      { path: '/kvkk', element: <Kvkk /> },
      { path: '/giris', element: <Login /> },
      { path: '/sifremi-unuttum', element: <ForgotPassword /> },
      { path: '/sifre-yenile', element: <SetPassword mode="recovery" /> },
      { path: '/auth/onay', element: <SetPassword mode="invite" /> },
    ],
  },
  {
    element: (
      <RequireRole role="resident">
        <ResidentLayout />
      </RequireRole>
    ),
    children: [
      { path: '/panel', element: <PanelPage /> },
      { path: '/borclarim', element: <DebtsPage /> },
      { path: '/odeme', element: <CheckoutPage /> },
      { path: '/odeme/3d', element: <ThreeDSecurePage /> },
      { path: '/odeme/sonuc', element: <PaymentResultPage /> },
      { path: '/odemelerim', element: <PaymentsPage /> },
      { path: '/havale-bildirimi', element: page('Havale Bildir') },
      { path: '/duyurular', element: page('Duyurular') },
      { path: '/taleplerim', element: page('Taleplerim') },
      { path: '/profil', element: page('Profil') },
    ],
  },
  {
    path: '/yonetim',
    element: (
      <RequireRole role="admin">
        <AdminLayout />
      </RequireRole>
    ),
    children: [
      { index: true, element: page('Genel Bakış') },
      { path: 'daireler', element: <UnitsPage /> },
      { path: 'sakinler', element: <ResidentsPage /> },
      { path: 'borclandirma', element: <BorclandirmaPage /> },
      { path: 'tahsilatlar', element: <AdminPaymentsPage /> },
      { path: 'havale-onaylari', element: page('Havale Onayları') },
      { path: 'duyurular', element: page('Duyurular') },
      { path: 'talepler', element: page('Talepler') },
      { path: 'teklif-talepleri', element: page('Teklif Talepleri') },
      { path: 'raporlar', element: page('Raporlar') },
      { path: 'ayarlar', element: page('Ayarlar') },
    ],
  },
  { path: '*', element: <NotFound /> },
]
