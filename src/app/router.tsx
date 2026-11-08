import { createHashRouter } from 'react-router'
import { routes } from '@/app/routes'

// A function, NOT a router created when this file loads. A router reads the address bar the
// moment it is created. E-mail links put login tokens in the address, so main.tsx first runs
// handleAuthRedirect() (it cleans the address) and only then creates the router.
export function createAppRouter() {
  return createHashRouter(routes)
}
