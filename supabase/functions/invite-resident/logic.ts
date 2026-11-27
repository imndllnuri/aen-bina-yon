// Pure decision logic for the invite-resident Edge Function.
// No imports on purpose: this file is unit-tested with vitest (Node) and used by index.ts (Deno).
//
// The function runs with the SECRET key, which bypasses Row Level Security. So every rule that
// RLS would normally enforce is written out here and tested.

// ---------------------------------------------------------------------------
// Where the browser may call from, and where invite links lead
// ---------------------------------------------------------------------------
// These must also be on Supabase's "Redirect URLs" list (supabase/config.toml).
export const ALLOWED_ORIGINS: readonly string[] = ['https://imndllnuri.github.io', 'http://localhost:5173']
const SITE_PATH = '/aen-bina-yon/'

export function isAllowedOrigin(origin: string | null): origin is string {
  return origin !== null && ALLOWED_ORIGINS.includes(origin)
}

/** CORS headers. Only the two known sites get "Access-Control-Allow-Origin". */
export function corsHeadersFor(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  }
  if (isAllowedOrigin(origin)) headers['Access-Control-Allow-Origin'] = origin
  return headers
}

/**
 * Where the e-mail link must lead after Supabase checks it. Built from the (allow-listed)
 * Origin header, never from anything the caller types. "?flow=invite" tells the site to open the
 * "activate your account" page (with the KVKK tick), even for a recovery-type link.
 */
export function inviteRedirectFor(origin: string | null): string | null {
  return isAllowedOrigin(origin) ? `${origin}${SITE_PATH}?flow=invite` : null
}

// ---------------------------------------------------------------------------
// Request validation
// ---------------------------------------------------------------------------
export type Relation = 'owner' | 'tenant'

export interface InviteBody {
  action: 'invite'
  email: string
  fullName: string
  phone: string | null
  unitId: string
  relation: Relation
  startDate: string | null
}
export interface LinkBody {
  action: 'link'
  profileId: string
}
/** An admin invites a person to be an ADMIN of a site (a new account, or someone the company already knows). */
export interface AdminInviteBody {
  action: 'invite-admin'
  email: string
  fullName: string
  phone: string | null
  siteId: string
}
/** A fresh sign-in link for an admin of this site who has not finished the invite page yet. */
export interface AdminLinkBody {
  action: 'admin-link'
  siteId: string
  profileId: string
}
export type RequestBody = InviteBody | LinkBody | AdminInviteBody | AdminLinkBody
export type ParseResult = { ok: true; value: RequestBody } | { ok: false; message: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE = /^\+?[0-9\s()-]{7,30}$/
const DATE = /^\d{4}-\d{2}-\d{2}$/

/** Supabase stores e-mail addresses in lower case. */
export const normalizeEmail = (value: string) => value.trim().toLowerCase()

function isRealDate(value: string): boolean {
  if (!DATE.test(value)) return false
  const date = new Date(`${value}T12:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value)
}

export function parseRequest(raw: unknown): ParseResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false, message: 'body must be an object' }
  const body = raw as Record<string, unknown>
  const text = (key: string) => (typeof body[key] === 'string' ? (body[key] as string).trim() : '')

  if (body.action === 'link') {
    if (!UUID.test(text('profileId'))) return { ok: false, message: 'profileId must be a uuid' }
    return { ok: true, value: { action: 'link', profileId: text('profileId').toLowerCase() } }
  }

  if (body.action === 'admin-link') {
    if (!UUID.test(text('siteId'))) return { ok: false, message: 'siteId must be a uuid' }
    if (!UUID.test(text('profileId'))) return { ok: false, message: 'profileId must be a uuid' }
    return { ok: true, value: { action: 'admin-link', siteId: text('siteId').toLowerCase(), profileId: text('profileId').toLowerCase() } }
  }

  if (body.action === 'invite-admin') {
    const email = normalizeEmail(text('email'))
    if (!EMAIL.test(email) || email.length > 200) return { ok: false, message: 'invalid e-mail' }
    const fullName = text('fullName')
    if (fullName.length < 2 || fullName.length > 200) return { ok: false, message: 'fullName must be 2-200 characters' }
    const phone = text('phone')
    if (phone !== '' && !PHONE.test(phone)) return { ok: false, message: 'invalid phone' }
    if (!UUID.test(text('siteId'))) return { ok: false, message: 'siteId must be a uuid' }
    return { ok: true, value: { action: 'invite-admin', email, fullName, phone: phone === '' ? null : phone, siteId: text('siteId').toLowerCase() } }
  }

  if (body.action === 'invite') {
    const email = normalizeEmail(text('email'))
    if (!EMAIL.test(email) || email.length > 200) return { ok: false, message: 'invalid e-mail' }

    const fullName = text('fullName')
    if (fullName.length < 2 || fullName.length > 200) return { ok: false, message: 'fullName must be 2-200 characters' }

    const phone = text('phone')
    if (phone !== '' && !PHONE.test(phone)) return { ok: false, message: 'invalid phone' }

    if (!UUID.test(text('unitId'))) return { ok: false, message: 'unitId must be a uuid' }
    if (body.relation !== 'owner' && body.relation !== 'tenant') return { ok: false, message: 'relation must be owner or tenant' }

    const startDate = text('startDate')
    if (startDate !== '' && !isRealDate(startDate)) return { ok: false, message: 'startDate must be YYYY-MM-DD' }

    return {
      ok: true,
      value: {
        action: 'invite',
        email,
        fullName,
        phone: phone === '' ? null : phone,
        unitId: text('unitId').toLowerCase(),
        relation: body.relation,
        startDate: startDate === '' ? null : startDate,
      },
    }
  }

  return { ok: false, message: 'unknown action' }
}

// ---------------------------------------------------------------------------
// Answers
// ---------------------------------------------------------------------------
export type ErrorCode =
  | 'invalid_request'
  | 'origin_not_allowed'
  | 'forbidden'
  | 'unit_not_found'
  | 'already_linked'
  | 'email_in_use_elsewhere'
  | 'account_inactive'
  | 'already_active'
  | 'failed'

export const STATUS_FOR: Record<ErrorCode, number> = {
  invalid_request: 400,
  origin_not_allowed: 403,
  forbidden: 403,
  unit_not_found: 404,
  already_linked: 409,
  email_in_use_elsewhere: 409,
  account_inactive: 409,
  already_active: 409,
  failed: 500,
}

// ---------------------------------------------------------------------------
// May a sign-in link be handed to the admin? (the most sensitive rule in this file)
// ---------------------------------------------------------------------------
// Whoever holds an invite or recovery link can sign in as that person. So a link is only issued
// for someone who has NOT finished onboarding yet (no KVKK consent recorded: the invite page
// records it as its last step), who is a plain resident (not an admin or staff member anywhere),
// who is active, and who is not the caller. For everyone else the admin gets NO link: those
// people reset their own password by e-mail.
export interface LinkSubject {
  isCaller: boolean
  isActive: boolean
  /** Has any row in site_members (admin, auditor or staff of any site). */
  hasSiteMembership: boolean
  /** profiles.kvkk_consent_at; null means onboarding is not finished. */
  kvkkConsentAt: string | null
}

export type LinkDecision = { allowed: true } | { allowed: false; reason: 'self' | 'inactive' | 'staff' | 'already_active' }

export function decideLink(subject: LinkSubject): LinkDecision {
  if (subject.isCaller) return { allowed: false, reason: 'self' }
  if (!subject.isActive) return { allowed: false, reason: 'inactive' }
  if (subject.hasSiteMembership) return { allowed: false, reason: 'staff' }
  if (subject.kvkkConsentAt !== null) return { allowed: false, reason: 'already_active' }
  return { allowed: true }
}

// ---------------------------------------------------------------------------
// The same question for an ADMIN of a site
// ---------------------------------------------------------------------------
// A pending admin (invited, invite page not finished) may get a fresh link from another admin of THE SAME site. The rules are
// the ones above, except that "is an admin of this site" is now required instead of forbidden.
export interface AdminLinkSubject {
  isCaller: boolean
  isActive: boolean
  /** The person has a site_members row with role admin for THIS site. */
  isAdminOfThisSite: boolean
  /** profiles.kvkk_consent_at; null means onboarding is not finished. */
  kvkkConsentAt: string | null
}

export type AdminLinkDecision = { allowed: true } | { allowed: false; reason: 'self' | 'inactive' | 'not_admin' | 'already_active' }

export function decideAdminLink(subject: AdminLinkSubject): AdminLinkDecision {
  if (subject.isCaller) return { allowed: false, reason: 'self' }
  if (!subject.isActive) return { allowed: false, reason: 'inactive' }
  if (!subject.isAdminOfThisSite) return { allowed: false, reason: 'not_admin' }
  if (subject.kvkkConsentAt !== null) return { allowed: false, reason: 'already_active' }
  return { allowed: true }
}

/**
 * What the answer of the database function add_site_admin means for the person who invited.
 * "person_not_found" is the database's one answer for every reason a person cannot be made admin (another company, deactivated,
 * unknown), so it is told as "e-mail in use elsewhere": the caller learns nothing more.
 */
export function errorCodeForRpc(error: { message?: string; code?: string } | null | undefined): ErrorCode {
  if (error?.code === '42501') return 'forbidden'
  if (error?.message === 'person_not_found') return 'email_in_use_elsewhere'
  if (error?.message === 'already_member') return 'already_linked'
  return 'failed'
}

/**
 * An invite link only works for an account whose invite was never clicked. Once it was clicked
 * (e-mail confirmed) Supabase refuses a second invite ("email_exists"), so a recovery link is used.
 */
export function linkTypeFor(emailConfirmed: boolean): 'invite' | 'recovery' {
  return emailConfirmed ? 'recovery' : 'invite'
}
