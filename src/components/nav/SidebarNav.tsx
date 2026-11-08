import type { LucideIcon } from 'lucide-react'
import { NavLink } from 'react-router'
import { cn } from '@/lib/utils'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** Match the exact path only (for index routes such as /yonetim). */
  end?: boolean
}

export interface NavGroup {
  title?: string
  items: NavItem[]
}

export function SidebarNav({ groups, onNavigate }: { groups: NavGroup[]; onNavigate?: () => void }) {
  return (
    <nav aria-label="Ana menü" className="flex flex-col gap-5">
      {groups.map((group, index) => (
        <div key={group.title ?? index} className="flex flex-col gap-1">
          {group.title && (
            <p className="px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.title}</p>
          )}
          {group.items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium outline-none transition-colors',
                  'focus-visible:ring-3 focus-visible:ring-ring/50',
                  isActive
                    ? 'bg-primary-soft text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )
              }
            >
              <item.icon className="size-4 shrink-0" aria-hidden="true" />
              {item.label}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  )
}
