import type { Control, FieldPath, FieldValues } from 'react-hook-form'
import { Controller } from 'react-hook-form'
import { Checkbox } from '@/components/ui/checkbox'

/** A labelled checkbox that works with react-hook-form (the value is true or false). */
export function CheckboxField<T extends FieldValues>({
  control,
  name,
  id,
  label,
  hint,
}: {
  control: Control<T>
  name: FieldPath<T>
  id: string
  label: string
  hint?: string
}) {
  const hintId = hint ? `${id}-hint` : undefined
  return (
    <div className="flex items-start gap-3">
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <Checkbox
            id={id}
            checked={field.value === true}
            onCheckedChange={(checked) => field.onChange(checked === true)}
            onBlur={field.onBlur}
            aria-describedby={hintId}
            className="mt-0.5"
          />
        )}
      />
      <div className="space-y-0.5">
        <label htmlFor={id} className="text-sm font-medium leading-snug">
          {label}
        </label>
        {hint && (
          <p id={hintId} className="text-xs text-muted-foreground">
            {hint}
          </p>
        )}
      </div>
    </div>
  )
}
