import type { RouteObject } from 'react-router'
import { AdminLayout } from '@/app/layouts/AdminLayout'
import { PublicLayout } from '@/app/layouts/PublicLayout'
import { ResidentLayout } from '@/app/layouts/ResidentLayout'
import { ForgotPassword } from '@/features/auth/ForgotPassword'
import { Login } from '@/features/auth/Login'
import { SetPassword } from '@/features/auth/SetPassword'
import { AdminAnnouncementsPage } from '@/features/admin/AnnouncementsPage'
import { AdminDashboardPage } from '@/features/admin/DashboardPage'
import { AuditPage } from '@/features/admin/AuditPage'
import { AdminsPage } from '@/features/admin/AdminsPage'
import { ContactMessagesPage } from '@/features/admin/ContactMessagesPage'
import { QuoteRequestsPage } from '@/features/admin/QuoteRequestsPage'
import { ReportsPage } from '@/features/admin/ReportsPage'
import { SettingsPage } from '@/features/admin/SettingsPage'
import { BorclandirmaPage } from '@/features/admin/BorclandirmaPage'
import { AdminPaymentsPage } from '@/features/admin/PaymentsPage'
import { AdminRequestDetailPage } from '@/features/admin/RequestDetailPage'
import { AdminRequestsPage } from '@/features/admin/RequestsPage'
import { ResidentsPage } from '@/features/admin/ResidentsPage'
import { TransferApprovalsPage } from '@/features/admin/TransferApprovalsPage'
import { UnitsPage } from '@/features/admin/UnitsPage'
import { NotFound } from '@/features/NotFound'
import { NotificationsPage } from '@/features/notifications/NotificationsPage'
import { AnnouncementsPage } from '@/features/resident/AnnouncementsPage'
import { CheckoutPage } from '@/features/resident/CheckoutPage'
import { DebtsPage } from '@/features/resident/DebtsPage'
import { PanelPage } from '@/features/resident/PanelPage'
import { PaymentResultPage } from '@/features/resident/PaymentResultPage'
import { PaymentsPage } from '@/features/resident/PaymentsPage'
import { RequestCreatePage } from '@/features/resident/RequestCreatePage'
import { RequestDetailPage } from '@/features/resident/RequestDetailPage'
import { RequestsPage } from '@/features/resident/RequestsPage'
import { ThreeDSecurePage } from '@/features/resident/ThreeDSecurePage'
import { TransferNoticePage } from '@/features/resident/TransferNoticePage'
import { Contact } from '@/features/public/Contact'
import { ProfilePage } from '@/features/profile/ProfilePage'
import { Home } from '@/features/public/Home'
import { Kvkk } from '@/features/public/Kvkk'
import { Quote } from '@/features/public/Quote'
import { Cookies } from '@/features/public/legal/Cookies'
import { DistanceSales } from '@/features/public/legal/DistanceSales'
import { Faq } from '@/features/public/legal/Faq'
import { Kmk } from '@/features/public/legal/Kmk'
import { ServiceDetail } from '@/features/public/ServiceDetail'
import { Services } from '@/features/public/Services'
import { RequireRole } from '@/lib/auth-guard'

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
      { path: '/hizmetler/:slug', element: <ServiceDetail /> },
      { path: '/teklif-al', element: <Quote /> },
      { path: '/iletisim', element: <Contact /> },
      { path: '/kvkk', element: <Kvkk /> },
      { path: '/sss', element: <Faq /> },
      { path: '/cerez-politikasi', element: <Cookies /> },
      { path: '/mesafeli-satis', element: <DistanceSales /> },
      { path: '/kat-mulkiyeti-kanunu', element: <Kmk /> },
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
      { path: '/havale-bildirimi', element: <TransferNoticePage /> },
      { path: '/duyurular', element: <AnnouncementsPage /> },
      { path: '/bildirimler', element: <NotificationsPage /> },
      { path: '/taleplerim', element: <RequestsPage /> },
      { path: '/taleplerim/yeni', element: <RequestCreatePage /> },
      { path: '/taleplerim/:id', element: <RequestDetailPage /> },
      { path: '/profil', element: <ProfilePage /> },
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
      { index: true, element: <AdminDashboardPage /> },
      { path: 'daireler', element: <UnitsPage /> },
      { path: 'sakinler', element: <ResidentsPage /> },
      { path: 'yoneticiler', element: <AdminsPage /> },
      { path: 'borclandirma', element: <BorclandirmaPage /> },
      { path: 'tahsilatlar', element: <AdminPaymentsPage /> },
      { path: 'havale-onaylari', element: <TransferApprovalsPage /> },
      { path: 'duyurular', element: <AdminAnnouncementsPage /> },
      { path: 'bildirimler', element: <NotificationsPage /> },
      { path: 'talepler', element: <AdminRequestsPage /> },
      { path: 'talepler/:id', element: <AdminRequestDetailPage /> },
      { path: 'teklif-talepleri', element: <QuoteRequestsPage /> },
      { path: 'mesajlar', element: <ContactMessagesPage /> },
      { path: 'raporlar', element: <ReportsPage /> },
      { path: 'islem-gecmisi', element: <AuditPage /> },
      { path: 'ayarlar', element: <SettingsPage /> },
      { path: 'profil', element: <ProfilePage /> },
    ],
  },
  { path: '*', element: <NotFound /> },
]
