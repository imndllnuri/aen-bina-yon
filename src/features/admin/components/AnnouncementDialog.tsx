import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { FormField } from '@/components/FormField'
import { NativeSelect } from '@/components/NativeSelect'
import { ErrorBlock, FormError, LoadingBlock } from '@/components/StateBlocks'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { fetchAnnouncementTarget, previewAudience, publishAnnouncement, saveAnnouncement, type AdminAnnouncement } from '@/features/announcements/api'
import { announcementErrorMessage } from '@/features/announcements/lib/messages'
import { announcementSchema, AUDIENCE_LABEL, AUDIENCES, buildTarget, SCOPE_LABEL, SCOPES, type AnnouncementValues, type Target } from '@/features/announcements/lib/schemas'
import { TYPE_LABEL, TYPES } from '@/features/announcements/lib/state'
import { isoToIstanbulLocal, istanbulLocalToIso } from '@/features/announcements/lib/time'
import { useRefreshAnnouncements } from '@/features/announcements/queries'
import { todayIstanbul } from '@/lib/format'
import type { AdminSite } from '../api'
import { useBlocks, useResidents, useUnits } from '../queries'

function CheckList({ id, label, options, value, onChange, disabled, error }: { id: string; label: string; options: { id: string; label: string }[]; value: string[]; onChange: (next: string[]) => void; disabled?: boolean; error?: string }) {
  return (
    <fieldset className="space-y-1.5" aria-describedby={error ? `${id}-error` : undefined}>
      <legend className="text-sm font-medium">{label}</legend>
      <div className="max-h-44 space-y-1.5 overflow-y-auto rounded-lg border p-2">
        {options.length === 0 && <p className="text-sm text-muted-foreground">Seçilecek kayıt yok.</p>}
        {options.map((option) => (
          <div key={option.id} className="flex items-center gap-2">
            <Checkbox
              id={`${id}-${option.id}`}
              checked={value.includes(option.id)}
              disabled={disabled}
              onCheckedChange={(checked) => onChange(checked === true ? [...value, option.id] : value.filter((v) => v !== option.id))}
            />
            <Label htmlFor={`${id}-${option.id}`} className="text-sm font-normal">
              {option.label}
            </Label>
          </div>
        ))}
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  )
}

/** A new announcement can start with some fields filled in (the dashboard's "Hatırlatma Gönder" does). */
export interface AnnouncementPreset {
  title: string
  body: string
  audience: 'debtors'
}

function Form({ site, announcement, initialTarget, preset, onClose }: { site: AdminSite; announcement: AdminAnnouncement | null; initialTarget: Target | null; preset: AnnouncementPreset | null; onClose: () => void }) {
  const blocks = useBlocks(site.id)
  const units = useUnits(site.id)
  const residents = useResidents(site.id)
  const refresh = useRefreshAnnouncements()
  const [error, setError] = useState<string | null>(null)
  const published = announcement?.status === 'published'

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<AnnouncementValues>({
    resolver: zodResolver(announcementSchema),
    defaultValues: {
      title: announcement?.title ?? preset?.title ?? '',
      body: announcement?.body ?? preset?.body ?? '',
      type: announcement?.type ?? 'genel',
      pinned: announcement?.pinned ?? false,
      scope: initialTarget?.scope ?? 'site',
      audience: initialTarget?.audience ?? preset?.audience ?? 'all',
      blockIds: initialTarget?.block_ids ?? [],
      unitIds: initialTarget?.unit_ids ?? [],
      profileIds: initialTarget?.profile_ids ?? [],
      publishAt: isoToIstanbulLocal(announcement?.publishAt),
      expireAt: isoToIstanbulLocal(announcement?.expireAt),
    },
  })
  const [scope, audience, blockIds, unitIds, profileIds, pinned] = useWatch({ control, name: ['scope', 'audience', 'blockIds', 'unitIds', 'profileIds', 'pinned'] })

  const blockOptions = (blocks.data ?? []).map((b) => ({ id: b.id, label: b.name }))
  const blockName = useMemo(() => new Map((blocks.data ?? []).map((b) => [b.id, b.name])), [blocks.data])
  const unitOptions = [...(units.data ?? [])]
    .sort((a, b) => (blockName.get(a.blockId) ?? '').localeCompare(blockName.get(b.blockId) ?? '', 'tr') || a.doorNo.localeCompare(b.doorNo, 'tr', { numeric: true }))
    .map((u) => ({ id: u.id, label: `${blockName.get(u.blockId) ?? ''} · ${u.doorNo}` }))
  const today = todayIstanbul()
  const people = new Map<string, string>()
  for (const r of residents.data ?? []) {
    if (r.isActive && r.startDate <= today && (r.endDate === null || r.endDate > today)) people.set(r.profileId, `${r.fullName ?? r.email ?? 'İsimsiz'} (${r.blockName} · ${r.doorNo})`)
  }
  const personOptions = [...people.entries()].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label, 'tr'))

  // How many people would get it: asked from the database (the same resolver as publishing).
  const target = buildTarget({ scope, audience: scope === 'persons' ? 'all' : audience, blockIds, unitIds, profileIds })
  const ready = scope === 'site' || (scope === 'blocks' && blockIds.length > 0) || (scope === 'units' && unitIds.length > 0) || (scope === 'persons' && profileIds.length > 0)
  const preview = useQuery({ queryKey: ['announcements', 'preview', site.id, target], queryFn: () => previewAudience(site.id, target), enabled: ready, staleTime: 0, retry: false })

  const send = (publish: boolean) =>
    handleSubmit(async (values) => {
      setError(null)
      try {
        const id = await saveAnnouncement({
          id: announcement?.id ?? null,
          siteId: site.id,
          title: values.title,
          body: values.body,
          type: values.type,
          pinned: values.pinned,
          target: buildTarget(values),
          publishAt: values.publishAt ? istanbulLocalToIso(values.publishAt) : null,
          expireAt: values.expireAt ? istanbulLocalToIso(values.expireAt) : null,
        })
        if (publish) {
          const count = await publishAnnouncement(id)
          toast.success(`Duyuru yayınlandı. ${count} kişiye gitti.`)
        } else {
          toast.success(published ? 'Değişiklikler kaydedildi.' : 'Taslak kaydedildi.')
        }
        await refresh()
        onClose()
      } catch (caught) {
        setError(announcementErrorMessage(caught))
      }
    })

  return (
    <>
      <DialogHeader>
        <DialogTitle>{announcement ? 'Duyuruyu düzenle' : 'Yeni duyuru'}</DialogTitle>
        <DialogDescription>Düz metin yazın. Yayınlayınca seçtiğiniz kişilere bildirim gider ve Duyurular sayfalarında görünür.</DialogDescription>
      </DialogHeader>
      <form onSubmit={(event) => event.preventDefault()} noValidate className="space-y-4">
        <FormField id="ann-title" label="Başlık" required error={errors.title?.message}>
          {(props) => <Input {...props} {...register('title')} maxLength={120} autoComplete="off" />}
        </FormField>
        <FormField id="ann-body" label="Metin" required error={errors.body?.message}>
          {(props) => <Textarea {...props} {...register('body')} rows={6} maxLength={5000} />}
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="ann-type" label="Tür" required error={errors.type?.message}>
            {(props) => (
              <NativeSelect {...props} {...register('type')}>
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABEL[t]}
                  </option>
                ))}
              </NativeSelect>
            )}
          </FormField>
          <div className="flex items-end gap-2 pb-2">
            <Checkbox id="ann-pinned" checked={pinned} onCheckedChange={(checked) => setValue('pinned', checked === true)} />
            <Label htmlFor="ann-pinned" className="font-normal">
              Listenin en üstüne sabitle
            </Label>
          </div>
        </div>

        <fieldset className="space-y-3 rounded-lg border p-3">
          <legend className="px-1 text-sm font-medium">Kime gidecek?</legend>
          {published && <p className="text-xs text-muted-foreground">Yayınlanmış duyurunun alıcıları ve başlangıç zamanı değişmez. Değiştirmek için önce “Yayından kaldır”ı kullanın.</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField id="ann-scope" label="Kapsam">
              {(props) => (
                <NativeSelect {...props} {...register('scope')} disabled={published}>
                  {SCOPES.map((s) => (
                    <option key={s} value={s}>
                      {SCOPE_LABEL[s]}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </FormField>
            {scope !== 'persons' && (
              <FormField id="ann-audience" label="Kimler">
                {(props) => (
                  <NativeSelect {...props} {...register('audience')} disabled={published}>
                    {AUDIENCES.map((a) => (
                      <option key={a} value={a}>
                        {AUDIENCE_LABEL[a]}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </FormField>
            )}
          </div>
          {scope === 'blocks' && <CheckList id="ann-blocks" label="Bloklar" options={blockOptions} value={blockIds} disabled={published} onChange={(next) => setValue('blockIds', next, { shouldValidate: true })} error={errors.blockIds?.message} />}
          {scope === 'units' && <CheckList id="ann-units" label="Daireler" options={unitOptions} value={unitIds} disabled={published} onChange={(next) => setValue('unitIds', next, { shouldValidate: true })} error={errors.unitIds?.message} />}
          {scope === 'persons' && <CheckList id="ann-persons" label="Kişiler" options={personOptions} value={profileIds} disabled={published} onChange={(next) => setValue('profileIds', next, { shouldValidate: true })} error={errors.profileIds?.message} />}
          <p className="text-sm" role="status" aria-live="polite">
            {!ready && <span className="text-muted-foreground">Alıcıları seçin; kaç kişiye gideceği burada görünür.</span>}
            {ready && preview.isPending && <span className="text-muted-foreground">Alıcılar sayılıyor…</span>}
            {ready && preview.isError && <span className="text-destructive">{announcementErrorMessage(preview.error)}</span>}
            {ready && preview.data && (
              <span>
                Bu duyuru <strong>{preview.data.recipients}</strong> kişiye ({preview.data.units} daire) gidecek.
                {preview.data.recipients === 0 && ' Alıcı yok: yayınlanamaz.'}
              </span>
            )}
          </p>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="ann-start" label="Başlangıç (isteğe bağlı)" error={errors.publishAt?.message} hint="Boş bırakırsanız hemen görünür. İstanbul saati.">
            {(props) => <Input {...props} {...register('publishAt')} type="datetime-local" disabled={published} />}
          </FormField>
          <FormField id="ann-end" label="Bitiş (isteğe bağlı)" error={errors.expireAt?.message} hint="Bitişten sonra arşive gider.">
            {(props) => <Input {...props} {...register('expireAt')} type="datetime-local" />}
          </FormField>
        </div>

        <FormError message={error} />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            Vazgeç
          </Button>
          {published ? (
            <Button type="button" onClick={() => void send(false)()} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="animate-spin" aria-hidden="true" />}
              Kaydet
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={() => void send(false)()} disabled={isSubmitting}>
                Taslak olarak kaydet
              </Button>
              <Button type="button" onClick={() => void send(true)()} disabled={isSubmitting || (ready && preview.data?.recipients === 0)}>
                {isSubmitting && <Loader2 className="animate-spin" aria-hidden="true" />}
                Kaydet ve yayınla
              </Button>
            </>
          )}
        </DialogFooter>
      </form>
    </>
  )
}

/** Compose or edit an announcement. The form only exists while the dialog is open, so it starts fresh every time. */
export function AnnouncementDialog({ open, onOpenChange, site, announcement, preset = null }: { open: boolean; onOpenChange: (open: boolean) => void; site: AdminSite; announcement: AdminAnnouncement | null; preset?: AnnouncementPreset | null }) {
  // To edit, the target is loaded first (residents never read it; an admin gets it from a checked function).
  const target = useQuery({
    queryKey: ['announcements', 'target', announcement?.id],
    queryFn: () => fetchAnnouncementTarget(announcement!.id),
    enabled: open && announcement !== null,
    staleTime: 0,
  })
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-2xl">
        {open && announcement && target.isPending && <LoadingBlock />}
        {open && announcement && target.isError && <ErrorBlock text="Duyurunun alıcıları yüklenemedi. Lütfen tekrar deneyin." onRetry={() => void target.refetch()} />}
        {open && (announcement === null || target.data) && <Form site={site} announcement={announcement} initialTarget={target.data ?? null} preset={preset} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}
