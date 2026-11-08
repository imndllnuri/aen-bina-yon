import { Eye, EyeOff, type LucideIcon } from 'lucide-react'
import { useState, type ComponentProps, type ReactNode } from 'react'
import { IconCircle } from '@/components/IconCircle'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

/** The centered card used by every login-related page. */
export function AuthShell({
  icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon
  title: string
  description?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="mx-auto flex max-w-md px-4 py-12 sm:py-20">
      <Card className="w-full">
        <CardHeader>
          <IconCircle icon={icon} />
          <h1 className="mt-2 font-display text-xl font-semibold">{title}</h1>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent className="space-y-4">{children}</CardContent>
      </Card>
    </section>
  )
}

/** A password input with a "show / hide" button (helpful on phones). */
export function PasswordInput(props: Omit<ComponentProps<typeof Input>, 'type'>) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <Input {...props} type={visible ? 'text' : 'password'} className="h-10 pr-11" />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="absolute top-1.5 right-1.5"
        aria-label={visible ? 'Şifreyi gizle' : 'Şifreyi göster'}
        aria-pressed={visible}
        onClick={() => setVisible((value) => !value)}
      >
        {visible ? <EyeOff /> : <Eye />}
      </Button>
    </div>
  )
}

/** A calm red box for a problem message. */
export function ProblemNote({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
      {children}
    </p>
  )
}
