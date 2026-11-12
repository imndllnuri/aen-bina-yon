import { Loader2, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { formatKurus } from '@/lib/money'
import { payMock } from './api'
import { PaymentFrame, TestBanner } from './components/PaymentFrame'
import { paymentErrorMessage } from './lib/payment'

interface ThreeDState {
  chargeIds: string[]
  installments: number
  expectedTotalKurus: number
  requestId: string
}

/**
 * The FAKE bank screen (3D Secure). "Onayla" asks the database to record the payment; "Başarısız Simüle Et"
 * writes nothing at all. A real provider (iyzico) will replace this page later.
 */
export function ThreeDSecurePage() {
  const location = useLocation()
  const navigate = useNavigate()
  const state = location.state as Partial<ThreeDState> | null
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!state?.chargeIds?.length || !state.requestId || state.expectedTotalKurus === undefined || !state.installments) {
    return (
      <PaymentFrame title="3D Secure">
        <p role="status" className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          Ödeme bilgisi bulunamadı (sayfa yenilenmiş olabilir). Borçlarınızı yeniden seçin.
        </p>
        <Button asChild>
          <Link to="/borclarim">Borçlarıma git</Link>
        </Button>
      </PaymentFrame>
    )
  }
  const { chargeIds, installments, expectedTotalKurus, requestId } = state as ThreeDState

  const approve = async () => {
    setBusy(true)
    setError(null)
    try {
      const paymentId = await payMock({ requestId, chargeIds, installments, expectedTotalKurus })
      navigate(`/odeme/sonuc?id=${encodeURIComponent(paymentId)}`, { replace: true })
    } catch (caught) {
      setError(paymentErrorMessage(caught))
      setBusy(false)
    }
  }

  return (
    <PaymentFrame title="3D Secure">
      <TestBanner />
      <section className="space-y-4 rounded-xl border-2 border-dashed p-6 text-center" aria-label="Sahte banka ekranı">
        <ShieldCheck className="mx-auto size-10 text-primary" aria-hidden="true" />
        <h2 className="text-lg font-semibold">Banka doğrulaması (deneme)</h2>
        <p className="text-sm text-muted-foreground">Bu ekran gerçek bir banka ekranı değildir. Aşağıdaki düğmelerle başarılı ya da başarısız ödemeyi deneyebilirsiniz.</p>
        <p className="text-2xl font-bold tabular-nums">{formatKurus(expectedTotalKurus)}</p>
        {error && (
          <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-center gap-3">
          <Button onClick={() => void approve()} disabled={busy}>
            {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
            Onayla
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => navigate('/odeme/sonuc?durum=basarisiz', { replace: true, state: { chargeIds } })}
          >
            Başarısız Simüle Et
          </Button>
        </div>
      </section>
    </PaymentFrame>
  )
}
