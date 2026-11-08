import { Link } from 'react-router'
import { Button } from '@/components/ui/button'

export function NotFound() {
  return (
    <section className="mx-auto flex max-w-2xl flex-col items-start gap-4 px-4 py-20">
      <p className="font-display text-5xl font-extrabold text-primary">404</p>
      <h1 className="text-2xl font-bold">Sayfa bulunamadı</h1>
      <p className="text-muted-foreground">Aradığınız sayfa taşınmış ya da hiç var olmamış olabilir.</p>
      <Button asChild>
        <Link to="/">Ana sayfaya dön</Link>
      </Button>
    </section>
  )
}
