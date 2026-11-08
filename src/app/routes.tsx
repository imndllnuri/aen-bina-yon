import type { RouteObject } from 'react-router'
import { AdminLayout } from '@/app/layouts/AdminLayout'
import { PublicLayout } from '@/app/layouts/PublicLayout'
import { ResidentLayout } from '@/app/layouts/ResidentLayout'
import { PlaceholderPage } from '@/components/PlaceholderPage'
import { Login } from '@/features/auth/Login'
import { NotFound } from '@/features/NotFound'
import { Home } from '@/features/public/Home'
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
      { path: '/hizmetler', element: page('Hizmetler') },
      { path: '/teklif-al', element: page('Teklif Al') },
      { path: '/iletisim', element: page('İletişim') },
      { path: '/giris', element: <Login /> },
      { path: '/auth/onay', element: page('Hesap Onayı') },
    ],
  },
  {
    element: (
      <RequireRole role="resident">
        <ResidentLayout />
      </RequireRole>
    ),
    children: [
      { path: '/panel', element: page('Ana Sayfa') },
      { path: '/borclarim', element: page('Borçlarım') },
      { path: '/odeme', element: page('Ödeme Yap') },
      { path: '/odemelerim', element: page('Ödemelerim') },
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
      { path: 'daireler', element: page('Daireler') },
      { path: 'sakinler', element: page('Sakinler') },
      { path: 'borclandirma', element: page('Borçlandırma') },
      { path: 'tahsilatlar', element: page('Tahsilatlar') },
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
