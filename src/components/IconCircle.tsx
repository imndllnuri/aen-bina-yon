import type { LucideIcon } from 'lucide-react'

/** Plan, section 11: icons sit in a 40 px tinted circle, one per card, never bare. */
export function IconCircle({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-primary" aria-hidden="true">
      <Icon className="size-5" />
    </span>
  )
}
