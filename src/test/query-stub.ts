// A stand-in for one Supabase query: it records every call of the chain (.select().eq().order()...) and, when awaited,
// answers with the given result. Lets a test look at HOW a list is asked for, not only at what comes back.
export interface QueryCall {
  method: string
  args: unknown[]
}

export function stubQuery(result: { data?: unknown; error?: unknown }) {
  const calls: QueryCall[] = []
  const query: unknown = new Proxy(
    {},
    {
      get(_target, property) {
        if (property === 'then') return (resolve: (value: unknown) => void) => resolve({ data: null, error: null, ...result })
        return (...args: unknown[]) => {
          calls.push({ method: String(property), args })
          return query
        }
      },
    },
  )
  return { query, calls }
}

/** The arguments of the calls to one method, e.g. every `.order(...)`. */
export const callsTo = (calls: QueryCall[], method: string) => calls.filter((c) => c.method === method).map((c) => c.args)
