import { MessageCircle } from 'lucide-react'
import { site } from '@/config/site'

/** A round WhatsApp button, fixed at the bottom right of every public page (hidden on paper). */
export function WhatsAppButton() {
  return (
    <a
      href={`https://wa.me/${site.whatsapp}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="WhatsApp ile yazın"
      className="fixed right-4 bottom-4 z-40 flex size-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg outline-none transition-transform hover:scale-105 focus-visible:ring-3 focus-visible:ring-ring/60 print:hidden"
    >
      <MessageCircle className="size-7" aria-hidden="true" />
    </a>
  )
}
