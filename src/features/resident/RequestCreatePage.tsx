import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { RequestForm } from '@/features/requests/components/RequestForm'
import { useRefreshRequests } from '@/features/requests/queries'
import { openRequest, tokenPayload } from '@/features/requests/submit'
import { createRequestIds } from '@/lib/request-ids'
import type { MyUnit } from './api'
import { ResidentGate } from './components/ResidentGate'

function CreateContent({ unit }: { unit: MyUnit }) {
  const navigate = useNavigate()
  const refresh = useRefreshRequests()
  const [keyFor] = useState(() => createRequestIds())

  return (
    <div className="space-y-4">
      <Link to="/taleplerim" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
        ← Taleplerime dön
      </Link>
      <div className="rounded-lg border bg-card p-4">
        <RequestForm
          idPrefix="new-request"
          submitLabel="Talebi gönder"
          withPhotos
          onCancel={() => navigate('/taleplerim')}
          onSubmit={async (values, photos) => {
            const id = await openRequest({ token: keyFor(tokenPayload(unit.unitId, null, values, photos)), unitId: unit.unitId, requesterId: null, values, photos })
            await refresh()
            toast.success('Talebiniz alındı. Durumu değişince size haber vereceğiz.')
            navigate(`/taleplerim/${id}`)
          }}
        />
      </div>
    </div>
  )
}

/** Yeni talep: category, title, text, priority, place and up to three photos. */
export function RequestCreatePage() {
  return (
    <ResidentGate title="Yeni talep" description="Sorunu kısaca anlatın. Fotoğraf eklemek çözümü hızlandırır.">
      {(unit) => <CreateContent key={unit.unitId} unit={unit} />}
    </ResidentGate>
  )
}
