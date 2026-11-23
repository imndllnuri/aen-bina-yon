import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { FormField } from '@/components/FormField'
import { NativeSelect } from '@/components/NativeSelect'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { RequestForm } from '@/features/requests/components/RequestForm'
import { useRefreshRequests } from '@/features/requests/queries'
import { openRequest, tokenPayload } from '@/features/requests/submit'
import { todayIstanbul } from '@/lib/format'
import { createRequestIds } from '@/lib/request-ids'
import type { AdminSite } from '../api'
import { isCurrentResidency } from '../lib/residents'
import { useBlocks, useUnits } from '../queries'

/**
 * "Telefonla talep aç": an admin opens a request for a resident who called. The admin picks the unit and the person who is
 * asking (a person who lives there today). The request belongs to that person: they see it, they are told when it moves.
 */
export function AdminRequestDialog({ site, onOpenChange }: { site: AdminSite; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate()
  const refresh = useRefreshRequests()
  const blocks = useBlocks(site.id)
  const units = useUnits(site.id)
  const today = todayIstanbul()
  const [keyFor] = useState(() => createRequestIds())
  const [unitId, setUnitId] = useState('')
  const [requesterId, setRequesterId] = useState('')

  const blockName = useMemo(() => new Map((blocks.data ?? []).map((block) => [block.id, block.name])), [blocks.data])
  const unitList = useMemo(
    () => [...(units.data ?? [])].sort((a, b) => `${blockName.get(a.blockId) ?? ''} ${a.doorNo}`.localeCompare(`${blockName.get(b.blockId) ?? ''} ${b.doorNo}`, 'tr', { numeric: true })),
    [units.data, blockName],
  )
  const people = useMemo(() => {
    const unit = unitList.find((u) => u.id === unitId)
    if (!unit) return []
    return unit.residencies.filter((r) => isCurrentResidency(r, today))
  }, [unitList, unitId, today])

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Telefonla talep aç</DialogTitle>
          <DialogDescription>Arayan sakin için talep açın. Talep onun adına kaydedilir; durumu değişince sakine bildirim gider.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="ar-unit" label="Daire" required>
            {(props) => (
              <NativeSelect
                {...props}
                value={unitId}
                onChange={(event) => {
                  setUnitId(event.target.value)
                  setRequesterId('')
                }}
              >
                <option value="">Daire seçin</option>
                {unitList.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {blockName.get(unit.blockId) ?? ''} · {unit.doorNo}
                  </option>
                ))}
              </NativeSelect>
            )}
          </FormField>
          <FormField id="ar-person" label="Arayan kişi" required hint={unitId && people.length === 0 ? 'Bu dairede şu an oturan kimse görünmüyor.' : undefined}>
            {(props) => (
              <NativeSelect {...props} value={requesterId} onChange={(event) => setRequesterId(event.target.value)} disabled={people.length === 0}>
                <option value="">Kişi seçin</option>
                {people.map((person) => (
                  <option key={person.id} value={person.profileId}>
                    {person.fullName ?? person.email ?? 'İsimsiz'} ({person.relation === 'owner' ? 'Kat Maliki' : 'Kiracı'})
                  </option>
                ))}
              </NativeSelect>
            )}
          </FormField>
        </div>
        <RequestForm
          idPrefix="admin-request"
          submitLabel="Talebi aç"
          withPhotos
          onCancel={() => onOpenChange(false)}
          onSubmit={async (values, photos) => {
            if (!unitId || !requesterId) throw new Error('requester_invalid')
            const id = await openRequest({ token: keyFor(tokenPayload(unitId, requesterId, values, photos)), unitId, requesterId, values, photos })
            await refresh()
            toast.success('Talep açıldı.')
            onOpenChange(false)
            navigate(`/yonetim/talepler/${id}`)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
