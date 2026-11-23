import { Bell } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { useUnreadCount } from '../queries'

/** The bell in the page header, on every screen size. The number is how many notifications are still unread. */
export function NotificationBell({ to }: { to: string }) {
  const unread = useUnreadCount()
  const count = unread.data ?? 0
  return (
    <Button asChild variant="ghost" size="icon" className="relative">
      <Link to={to} aria-label={count > 0 ? `Bildirimler, ${count} okunmamış` : 'Bildirimler'}>
        <Bell aria-hidden="true" />
        {count > 0 && (
          <span
            aria-hidden="true"
            className="absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[0.65rem] leading-4 font-semibold text-white tabular-nums"
          >
            {count > 99 ? '99+' : count}
          </span>
        )}
      </Link>
    </Button>
  )
}
