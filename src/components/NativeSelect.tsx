import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

/**
 * A plain browser <select> styled like the shadcn Input. On phones it opens the native picker,
 * which is easier to use than a custom dropdown, and it works with every screen reader.
 */
export function NativeSelect({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <select
      data-slot="native-select"
      className={cn(
        'h-10 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-base transition-colors outline-none',
        'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
        'aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20',
        'disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30 dark:[&>option]:bg-card',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  )
}
