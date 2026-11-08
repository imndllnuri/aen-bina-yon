import { Check, Copy, MessageCircle } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { site } from '@/config/site'
import { inviteMessage, whatsappUrl } from '../lib/invite-message'

/**
 * Shows the one-time sign-in link the admin sends to a resident (copy, or WhatsApp).
 * The link only lives in this dialog's props: it is not stored anywhere and is gone when closed.
 */
export function InviteLinkDialog({
  open,
  onOpenChange,
  link,
  name,
  phone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  link: string
  name: string
  phone: string | null
}) {
  const [copied, setCopied] = useState(false)
  const message = inviteMessage({ name, link, firmName: site.shortName })

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      toast.success('Bağlantı kopyalandı.')
    } catch {
      toast.error('Kopyalanamadı. Bağlantıyı elle seçip kopyalayın.')
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setCopied(false)
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Davet bağlantısı hazır</DialogTitle>
          <DialogDescription>
            <strong>{name}</strong> için tek kullanımlık bir giriş bağlantısı oluşturuldu. Bağlantıyı kişiye WhatsApp ya da başka bir
            yolla gönderin.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <label htmlFor="invite-link" className="text-sm font-medium">
            Bağlantı
          </label>
          <div className="flex gap-2">
            <Input id="invite-link" readOnly value={link} className="h-10 font-mono text-xs" onFocus={(event) => event.currentTarget.select()} />
            <Button type="button" variant="outline" className="h-10 shrink-0" onClick={() => void copy()}>
              {copied ? <Check /> : <Copy />} {copied ? 'Kopyalandı' : 'Kopyala'}
            </Button>
          </div>
        </div>

        <Button asChild className="h-10">
          <a href={whatsappUrl({ phone, message })} target="_blank" rel="noopener noreferrer">
            <MessageCircle /> WhatsApp ile gönder
          </a>
        </Button>

        <ul className="space-y-1.5 rounded-lg bg-muted p-3 text-sm text-muted-foreground">
          <li>Bağlantı yalnızca <strong className="text-foreground">bir kez</strong> kullanılabilir ve sadece bu kişiye özeldir.</li>
          <li>Başkasıyla paylaşmayın. Bağlantıya sahip olan kişi bu hesaba girebilir.</li>
          <li>E-posta ile otomatik gönderim için ayrıca bir e-posta servisi (SMTP) kurulması gerekir.</li>
        </ul>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Kapat</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
