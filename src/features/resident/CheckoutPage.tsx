import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { ErrorBlock, LoadingBlock } from '@/components/StateBlocks'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDate, monthLabel } from '@/lib/format'
import { formatKurus } from '@/lib/money'
import { createRequestIds } from '@/lib/request-ids'
import { quotePayment } from './api'
import { PaymentFrame, TestBanner } from './components/PaymentFrame'
import { INSTALLMENT_OPTIONS, paymentErrorMessage } from './lib/payment'
import { useUserId } from './queries'

export interface CheckoutState {
  chargeIds: string[]
}

function CheckoutContent({ chargeIds }: { chargeIds: string[] }) {
  const userId = useUserId()
  const navigate = useNavigate()
  const [installments, setInstallments] = useState(1)
  const [agreed, setAgreed] = useState(false)
  // The same request id for the same exact payment: a double click or a retry cannot pay twice.
  const [keyFor] = useState(() => createRequestIds())

  // The database computes the total and the fee. The browser only shows them.
  const quote = useQuery({
    queryKey: ['resident', 'quote', userId ?? '', chargeIds.join(','), installments],
    queryFn: () => quotePayment(chargeIds, installments),
    enabled: userId !== null,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  })

  return (
    <PaymentFrame title="Ödeme Yap">
      <TestBanner />

      <section aria-label="Ödeme özeti" className="space-y-3">
        <h2 className="text-lg font-semibold">Özet</h2>
        {quote.isPending && <LoadingBlock />}
        {quote.isError && (
          <div className="space-y-3">
            <ErrorBlock text={paymentErrorMessage(quote.error)} onRetry={() => void quote.refetch()} />
            <Button asChild variant="outline">
              <Link to="/borclarim">Borçlarıma dön</Link>
            </Button>
          </div>
        )}
        {quote.data && (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Borç</TableHead>
                  <TableHead className="text-right">Tutar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quote.data.lines.map((line) => (
                  <TableRow key={line.chargeId}>
                    <TableCell className="whitespace-normal">
                      <div>
                        {line.typeName ?? 'Borç'}
                        {line.period && <span className="text-muted-foreground"> · {monthLabel(line.period)}</span>}
                      </div>
                      <div className="text-xs text-muted-foreground">Son ödeme: {formatDate(line.dueDate)}</div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatKurus(line.amountKurus)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell>Komisyon{quote.data.feeKurus === 0 ? ' (yönetim öder)' : ''}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatKurus(quote.data.feeKurus)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-semibold">Toplam</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums" aria-live="polite">
                    {formatKurus(quote.data.totalKurus)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        )}
      </section>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Taksit</legend>
        <div className="flex flex-wrap gap-2">
          {INSTALLMENT_OPTIONS.map((option) => (
            <label key={option.value} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary-soft">
              <input type="radio" name="installments" className="size-4 accent-primary" checked={installments === option.value} onChange={() => setInstallments(option.value)} />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>

      <section aria-label="Deneme kartı" className="space-y-3 rounded-lg border p-4">
        <h2 className="text-lg font-semibold">Kart (deneme)</h2>
        <p className="text-sm text-muted-foreground">Bu bir deneme kartıdır. Alanlar değiştirilemez ve hiçbir yere gönderilmez.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5 sm:col-span-3">
            <Label htmlFor="card-number">Kart numarası</Label>
            <Input id="card-number" readOnly value="4111 1111 1111 1111" className="h-10" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="card-exp">Son kullanma</Label>
            <Input id="card-exp" readOnly value="12/30" className="h-10" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="card-cvc">Güvenlik kodu</Label>
            <Input id="card-cvc" readOnly value="000" className="h-10" />
          </div>
        </div>
      </section>

      <div className="flex items-start gap-3">
        <Checkbox id="agree" checked={agreed} onCheckedChange={(checked) => setAgreed(checked === true)} className="mt-0.5" />
        <label htmlFor="agree" className="text-sm leading-snug">
          Ön Bilgilendirme Formu ve Mesafeli Satış Sözleşmesi (<strong>taslak</strong>) ile{' '}
          <Link to="/kvkk" target="_blank" rel="noopener" className="font-medium text-primary underline-offset-4 hover:underline">
            KVKK Aydınlatma Metni
          </Link>
          &apos;ni okudum, kabul ediyorum.
        </label>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button asChild variant="outline">
          <Link to="/borclarim">Vazgeç</Link>
        </Button>
        <Button
          disabled={!quote.data || !agreed}
          onClick={() => {
            if (!quote.data) return
            const request = { chargeIds, installments, expectedTotalKurus: quote.data.totalKurus }
            navigate('/odeme/3d', { state: { ...request, requestId: keyFor(request) } })
          }}
        >
          Ödemeye geç{quote.data ? ` (${formatKurus(quote.data.totalKurus)})` : ''}
        </Button>
      </div>
    </PaymentFrame>
  )
}

/** Ödeme: the summary comes from the database (quote_payment); the person chooses installments and agrees. */
export function CheckoutPage() {
  const location = useLocation()
  const ids = (location.state as Partial<CheckoutState> | null)?.chargeIds

  if (!ids || ids.length === 0) {
    return (
      <PaymentFrame title="Ödeme Yap">
        <p role="status" className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          Önce ödemek istediğiniz borçları seçin.
        </p>
        <Button asChild>
          <Link to="/borclarim">Borçlarıma git</Link>
        </Button>
      </PaymentFrame>
    )
  }
  return <CheckoutContent chargeIds={ids} />
}
