import { useAuthState } from '@/lib/auth'

/** Small "who is logged in" label for the panel header (hidden on narrow phones). */
export function SignedInAs() {
  const { data } = useAuthState()
  if (data?.status !== 'signed-in' || !data.session.user.email) return null
  return (
    <span
      className="hidden max-w-48 truncate text-sm text-muted-foreground sm:inline"
      title={data.session.user.email}
      data-testid="signed-in-as"
    >
      {data.session.user.email}
    </span>
  )
}
