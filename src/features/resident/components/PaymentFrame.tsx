import type { ReactNode } from 'react'

/** The plain page frame of the payment steps (no unit switcher: the lines already say which unit). */
export function PaymentFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 sm:py-8">
      <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
      {children}
    </div>
  )
}

/** Yellow banner that must be on every payment screen while the checkout is a mock. */
export function TestBanner() {
  return (
    <p role="note" className="rounded-lg border border-highlight bg-highlight/15 p-3 text-sm font-medium">
      TEST MODU: Gerçek kart bilgisi girmeyin. Bu ekranlarda gerçek para çekilmez.
    </p>
  )
}
