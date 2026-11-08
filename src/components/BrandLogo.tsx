import { Link } from 'react-router'
import { site } from '@/config/site'

export function BrandLogo({ to = '/' }: { to?: string }) {
  return (
    <Link to={to} className="flex items-center gap-2.5 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
      <img src={site.logo} alt="" width={32} height={32} className="size-8" />
      <span className="font-display text-base font-bold tracking-tight">{site.shortName}</span>
    </Link>
  )
}
