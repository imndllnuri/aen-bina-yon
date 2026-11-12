import { Download, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { fetchReceipt } from './api'

/** "Makbuz (PDF)": reads the receipt from the database, then builds the PDF in the browser. */
export function ReceiptButton({ paymentId, label = 'Makbuz (PDF)', variant = 'outline' }: { paymentId: string; label?: string; variant?: 'outline' | 'default' | 'ghost' }) {
  const [busy, setBusy] = useState(false)

  const download = async () => {
    setBusy(true)
    try {
      const receipt = await fetchReceipt(paymentId)
      const { downloadReceipt } = await import('./downloadReceipt')
      await downloadReceipt(receipt)
    } catch {
      toast.error('Makbuz şu anda hazırlanamadı. Lütfen biraz sonra tekrar deneyin.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button variant={variant} size="sm" onClick={() => void download()} disabled={busy}>
      {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Download aria-hidden="true" />}
      {label}
    </Button>
  )
}
