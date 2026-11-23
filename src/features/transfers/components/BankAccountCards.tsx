import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { ErrorBlock, LoadingBlock } from '@/components/StateBlocks'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { formatIban } from '../lib/iban'
import { useBankAccounts } from '../queries'

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Some browsers refuse (no permission): the IBAN is on the screen, the person can select it by hand.
      setCopied(false)
    }
  }
  return (
    <Button variant="outline" size="sm" onClick={() => void copy()} aria-label={label}>
      {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      {copied ? 'Kopyalandı' : 'Kopyala'}
    </Button>
  )
}

/** The bank accounts of the management (IBAN cards). The residents copy the IBAN, then send the money in their bank app. */
export function BankAccountCards() {
  const accounts = useBankAccounts()
  if (accounts.isPending) return <LoadingBlock />
  if (accounts.isError) return <ErrorBlock text="Banka hesapları şu anda yüklenemedi. Lütfen tekrar deneyin." onRetry={() => void accounts.refetch()} />
  if (accounts.data.length === 0) {
    return (
      <p role="status" className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        Site yönetimi henüz bir banka hesabı eklememiş. Havale yapmadan önce yönetimle iletişime geçin.
      </p>
    )
  }
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {accounts.data.map((account) => (
        <li key={account.iban}>
          <Card size="sm">
            <CardContent className="space-y-2">
              <p className="font-medium">{account.bank}</p>
              <p className="text-sm text-muted-foreground">{account.holder}</p>
              <p className="font-mono text-sm tracking-wide" data-testid="iban">
                {formatIban(account.iban)}
              </p>
              <CopyButton text={account.iban} label={`${account.bank} IBAN’ını kopyala`} />
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  )
}
