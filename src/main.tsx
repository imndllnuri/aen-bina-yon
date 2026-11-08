import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router/dom'
import '@/index.css'
import { AppProviders } from '@/app/providers'
import { createAppRouter } from '@/app/router'
import { handleAuthRedirect } from '@/lib/auth-redirect'

// Links in invite and password-reset e-mails open this page with login tokens in the address.
// Handle them and clean the address BEFORE the router is created (the router would read the
// tokens as a page name).
await handleAuthRedirect().catch(() => {})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders>
      <RouterProvider router={createAppRouter()} />
    </AppProviders>
  </StrictMode>,
)
