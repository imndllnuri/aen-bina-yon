// A notification carries a link to a page of THIS app ("/borclarim"). The database only stores such paths, but the browser
// checks again before it navigates: a link is followed only when it is an internal path. Never an address, never a script.
const INTERNAL = /^\/[A-Za-z0-9/_-]{0,80}$/

/** The path to navigate to, or null when the link is missing or not an internal path. */
export function safeInternalPath(link: string | null | undefined): string | null {
  if (!link || !INTERNAL.test(link) || link.startsWith('//')) return null
  return link
}
