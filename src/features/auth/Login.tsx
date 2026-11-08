import { LockKeyhole } from 'lucide-react'
import { Link } from 'react-router'
import { IconCircle } from '@/components/IconCircle'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { isSupabaseConfigured } from '@/lib/supabase'

/** Placeholder. Feature slice 2 builds the real login, reset and invite forms. */
export function Login() {
  return (
    <section className="mx-auto flex max-w-md px-4 py-12 sm:py-20">
      <Card className="w-full">
        <CardHeader>
          <IconCircle icon={LockKeyhole} />
          <CardTitle className="mt-2 text-xl">Giriş</CardTitle>
          <CardDescription>
            Giriş formu yapım aşamasında. Hesap ve şifre işlemleri bir sonraki adımda eklenecek.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isSupabaseConfigured && (
            <p role="status" className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
              Sunucu bağlantısı henüz kurulmadı (Supabase ayarları eksik). Giriş yapılabilmesi için önce
              bağlantı ayarlarının tamamlanması gerekir.
            </p>
          )}
          <Button asChild variant="outline">
            <Link to="/">Ana sayfaya dön</Link>
          </Button>
        </CardContent>
      </Card>
    </section>
  )
}
