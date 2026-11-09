import { useMemo, type ReactNode } from 'react'
import { useWatch, type UseFormReturn } from 'react-hook-form'
import { FormField } from '@/components/FormField'
import { NativeSelect } from '@/components/NativeSelect'
import { Input } from '@/components/ui/input'
import type { ChargeTypeRow } from '../api'
import { dueDateFor, monthOptions } from '../lib/charges'
import { formatKurus, parseTryAmount } from '@/lib/money'
import { CheckboxField } from './CheckboxField'


/** The fields every charge form shares. Each form has more fields than this; names must match. */
export interface DetailsShape {
  typeId: string
  amount: string
  period: string
  dueDate: string
  description: string
  tenantVisible: boolean
}

/**
 * Charge type, amount, period, due date, description and "show to tenant". `children` is shown between
 * the type and the amount (the bulk form puts the split method there).
 */
export function ChargeFields({
  form,
  types,
  amountLabel,
  onTypeChange,
  idPrefix,
  children,
}: {
  form: UseFormReturn<DetailsShape>
  types: ChargeTypeRow[]
  amountLabel: string
  onTypeChange?: (typeId: string) => void
  idPrefix: string
  children?: ReactNode
}) {
  const {
    register,
    control,
    setValue,
    formState: { errors, dirtyFields },
  } = form
  const periods = useMemo(() => monthOptions(), [])

  // Shows what the typed text means, so "1.500" is seen as ₺1.500,00 before anything is sent.
  const parsed = parseTryAmount(useWatch({ control, name: 'amount' }))
  const amountHint = parsed.ok ? `= ${formatKurus(parsed.kurus)}` : 'Örnek: 1.500,50'

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField id={`${idPrefix}-type`} label="Borç türü" required error={errors.typeId?.message}>
        {(props) => (
          <NativeSelect {...props} {...register('typeId', { onChange: (event) => onTypeChange?.(event.target.value) })}>
            {types.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </NativeSelect>
        )}
      </FormField>
      {children}
      <FormField id={`${idPrefix}-amount`} label={amountLabel} required error={errors.amount?.message} hint={amountHint}>
        {(props) => <Input {...props} {...register('amount')} inputMode="decimal" autoComplete="off" className="h-10" />}
      </FormField>
      <FormField id={`${idPrefix}-period`} label="Dönem" required error={errors.period?.message}>
        {(props) => (
          <NativeSelect
            {...props}
            {...register('period', {
              // A due date the person has not touched follows the period (the 15th of that month).
              onChange: (event) => {
                if (!dirtyFields.dueDate) setValue('dueDate', dueDateFor(event.target.value, 15))
              },
            })}
          >
            {periods.map((period) => (
              <option key={period.value} value={period.value}>
                {period.label}
              </option>
            ))}
          </NativeSelect>
        )}
      </FormField>
      <FormField id={`${idPrefix}-due`} label="Son ödeme tarihi" required error={errors.dueDate?.message}>
        {(props) => <Input {...props} {...register('dueDate')} type="date" className="h-10" />}
      </FormField>
      <div className="sm:col-span-2">
        <FormField id={`${idPrefix}-desc`} label="Açıklama" error={errors.description?.message} hint="İsteğe bağlı. Sakin bu açıklamayı görür.">
          {(props) => <Input {...props} {...register('description')} maxLength={200} className="h-10" />}
        </FormField>
      </div>
      <div className="sm:col-span-2">
        <CheckboxField
          control={control}
          name="tenantVisible"
          id={`${idPrefix}-tenant`}
          label="Kiracıya yansıt"
          hint="Kapalıysa kiracı bu borcu görmez. Kat maliki her zaman tüm borçları görür (KMK m. 22)."
        />
      </div>
    </div>
  )
}
