import type { Receipt } from './api'

/**
 * Builds the receipt PDF in the browser and saves it. The PDF library and the font are loaded only now
 * (dynamic import), so the rest of the site stays small.
 */
export async function downloadReceipt(receipt: Receipt): Promise<void> {
  const [{ pdf }, { ReceiptDocument }] = await Promise.all([import('@react-pdf/renderer'), import('./ReceiptDocument')])
  const blob = await pdf(<ReceiptDocument receipt={receipt} />).toBlob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `makbuz-${receipt.receiptNo}.pdf`
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Give the browser a moment to start the download before the address is released.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
