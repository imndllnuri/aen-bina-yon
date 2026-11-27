import { TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'

/** The note every legal text carries until a lawyer has reviewed it. */
export const DRAFT_NOTE = 'Bu metin örnek bir taslaktır. Yayına almadan önce bir hukukçu tarafından incelenmelidir.'

/** A legal or information page: title, the "taslak" warning, and the text in numbered sections. */
export function LegalPage({ title, version, intro, draft = true, children }: { title: string; version?: string; intro?: ReactNode; draft?: boolean; children: ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
      <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
      {version && <p className="mt-1 text-xs text-muted-foreground">Sürüm: {version}</p>}
      {draft && (
        <p role="note" className="mt-4 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          <span>{DRAFT_NOTE}</span>
        </p>
      )}
      {intro && <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{intro}</p>}
      <div className="mt-6 space-y-6 text-sm leading-relaxed">{children}</div>
    </article>
  )
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-base font-semibold">{title}</h2>
      <div className="mt-1 space-y-2 text-muted-foreground">{children}</div>
    </section>
  )
}

/** A bullet list inside a legal section. */
export function LegalList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  )
}
