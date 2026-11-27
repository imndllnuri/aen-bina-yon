import { Link } from 'react-router'
import { LegalPage } from './LegalPage'
import { faq } from './faq-data'

/** SSS: frequently asked questions. Native <details> blocks work with the keyboard and screen readers, and need no script. */
export function Faq() {
  return (
    <LegalPage title="Sıkça Sorulan Sorular" intro={<>Aradığınız cevabı bulamazsanız <Link to="/iletisim" className="font-medium text-primary underline-offset-4 hover:underline">bize yazın</Link>.</>}>
      <div className="space-y-2">
        {faq.map((item) => (
          <details key={item.question} className="group rounded-lg border bg-card p-4 open:bg-muted/30">
            <summary className="cursor-pointer list-none font-medium marker:hidden [&::-webkit-details-marker]:hidden">
              <span className="flex items-start justify-between gap-3">
                {item.question}
                <span aria-hidden="true" className="text-muted-foreground transition-transform group-open:rotate-45">+</span>
              </span>
            </summary>
            <p className="mt-2 text-muted-foreground">{item.answer}</p>
          </details>
        ))}
      </div>
    </LegalPage>
  )
}
