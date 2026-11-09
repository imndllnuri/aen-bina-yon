/**
 * Idempotency keys for "create a charge batch".
 *
 * The database returns the SAME batch when it sees the same request id twice, so a double click or a
 * retry after a lost answer cannot charge twice. But the key must belong to ONE exact request:
 * if the person changes anything after a failed try, the request is a different one and needs a
 * fresh key. Otherwise a lost "success" answer followed by an edited amount would silently return
 * the old batch.
 *
 * `keyFor(payload)` gives the same id while the payload is identical and a new id as soon as it differs.
 */
export function createRequestIds(generate: () => string = () => crypto.randomUUID()) {
  let last: { payload: string; id: string } | null = null
  return function keyFor(payload: unknown): string {
    const json = JSON.stringify(payload)
    if (last === null || last.payload !== json) last = { payload: json, id: generate() }
    return last.id
  }
}
