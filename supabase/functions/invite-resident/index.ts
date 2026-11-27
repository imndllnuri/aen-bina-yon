// invite-resident: an admin invites a resident (or another admin) and gets a one-time sign-in link back.
//
// Why this is an Edge Function: creating a user needs the SECRET key, which must never reach a
// browser. The secret key bypasses Row Level Security, so EVERY permission check is written here
// (and the pure decisions live in logic.ts, with tests). Read supabase/functions/invite-resident/
// logic.ts first.
//
// Why a link instead of an e-mail: on the free Supabase plan the built-in e-mail service only sends
// to members of your Supabase organization. The admin copies the link or sends it by WhatsApp.
//
// Four actions:
//   { action: 'invite', email, fullName, phone?, unitId, relation, startDate? }
//        create the person (or link an existing one of the same company) to a unit
//   { action: 'link', profileId }
//        a new link for a resident who has not finished the invite page yet
//   { action: 'invite-admin', email, fullName, phone?, siteId }
//        make a person an ADMIN of a site (a new account, or someone the company already knows). The database function
//        add_site_admin() decides who may become admin; it runs with the CALLER'S token, so the audit log names the caller.
//   { action: 'admin-link', siteId, profileId }
//        a new link for an admin of that site who has not finished the invite page yet
//
// Never log links or tokens.
import '@supabase/functions-js/edge-runtime.d.ts'
import { withSupabase } from '@supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  corsHeadersFor,
  decideAdminLink,
  decideLink,
  errorCodeForRpc,
  inviteRedirectFor,
  linkTypeFor,
  parseRequest,
  STATUS_FOR,
  type AdminInviteBody,
  type AdminLinkBody,
  type ErrorCode,
  type InviteBody,
} from './logic.ts'

type Admin = SupabaseClient

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const fail = (code: ErrorCode) => json({ ok: false, error: code }, STATUS_FOR[code])

/** Is this person an ACTIVE admin of this site? (site_members row with role admin + active profile) */
async function isActiveSiteAdmin(admin: Admin, userId: string, siteId: string): Promise<boolean> {
  const { data } = await admin
    .from('site_members')
    .select('role, profiles!inner(is_active)')
    .eq('profile_id', userId)
    .eq('site_id', siteId)
    .eq('role', 'admin')
    .maybeSingle()
  return Boolean(data && data.profiles?.is_active)
}

/** Does this person already belong (as resident or staff) to a site of this company? */
async function belongsToCompany(admin: Admin, profileId: string, companyId: string): Promise<boolean> {
  const residents = await admin
    .from('unit_residents')
    .select('id, units!inner(blocks!inner(sites!inner(company_id)))')
    .eq('profile_id', profileId)
    .eq('units.blocks.sites.company_id', companyId)
    .limit(1)
  if ((residents.data?.length ?? 0) > 0) return true
  const members = await admin
    .from('site_members')
    .select('site_id, sites!inner(company_id)')
    .eq('profile_id', profileId)
    .eq('sites.company_id', companyId)
    .limit(1)
  return (members.data?.length ?? 0) > 0
}

/** Creates a fresh sign-in link for an existing account. Returns null when it cannot. */
async function issueLink(admin: Admin, userId: string, redirectTo: string): Promise<string | null> {
  const { data: found, error } = await admin.auth.admin.getUserById(userId)
  const user = found?.user
  if (error || !user?.email) return null
  const options = { redirectTo }
  const { data, error: linkError } =
    linkTypeFor(Boolean(user.email_confirmed_at)) === 'invite'
      ? await admin.auth.admin.generateLink({ type: 'invite', email: user.email, options })
      : await admin.auth.admin.generateLink({ type: 'recovery', email: user.email, options })
  return linkError ? null : (data?.properties?.action_link ?? null)
}

/** May the admin get a link for this (existing) person? Applies decideLink() to real data. */
async function linkAllowed(admin: Admin, callerId: string, profileId: string): Promise<'ok' | ErrorCode> {
  const { data: profile } = await admin.from('profiles').select('id, is_active, kvkk_consent_at').eq('id', profileId).maybeSingle()
  if (!profile) return 'forbidden'
  const { count } = await admin.from('site_members').select('profile_id', { count: 'exact', head: true }).eq('profile_id', profileId)
  const decision = decideLink({
    isCaller: profileId === callerId,
    isActive: Boolean(profile.is_active),
    hasSiteMembership: (count ?? 0) > 0,
    kvkkConsentAt: profile.kvkk_consent_at ?? null,
  })
  if (decision.allowed) return 'ok'
  return decision.reason === 'already_active' ? 'already_active' : 'forbidden'
}

async function invite(admin: Admin, callerId: string, body: InviteBody, redirectTo: string): Promise<Response> {
  // The site is taken from the UNIT, on the server. A site id sent by the browser is never trusted.
  const { data: unit } = await admin
    .from('units')
    .select('id, archived_at, blocks!inner(site_id, sites!inner(company_id))')
    .eq('id', body.unitId)
    .maybeSingle()
  if (!unit) return fail('forbidden') // same answer as "not your site": no way to probe which units exist
  const siteId: string = unit.blocks.site_id
  const companyId: string = unit.blocks.sites.company_id
  if (!(await isActiveSiteAdmin(admin, callerId, siteId))) return fail('forbidden')
  if (unit.archived_at) return fail('unit_not_found')

  const { data: existing } = await admin.from('profiles').select('id, is_active').eq('email', body.email).maybeSingle()

  let userId: string
  let createdNow = false
  let link: string | null = null

  if (existing) {
    if (!existing.is_active) return fail('account_inactive')
    // Only people already known to THIS company may be linked. Otherwise an admin could attach any
    // stranger's account to their own unit and so read that person's name and phone.
    if (!(await belongsToCompany(admin, existing.id, companyId))) return fail('email_in_use_elsewhere')
    userId = existing.id
  } else {
    const { data, error } = await admin.auth.admin.generateLink({
      type: 'invite',
      email: body.email,
      options: { data: { full_name: body.fullName }, redirectTo },
    })
    if (error || !data?.user) {
      console.error('generateLink failed:', error?.code ?? 'no-user')
      return fail(error?.code === 'email_exists' ? 'email_in_use_elsewhere' : 'failed')
    }
    userId = data.user.id
    createdNow = true
    link = data.properties?.action_link ?? null
    if (body.phone) await admin.from('profiles').update({ phone: body.phone }).eq('id', userId)
  }

  const linked = await admin.from('unit_residents').insert({
    unit_id: body.unitId,
    profile_id: userId,
    relation: body.relation,
    ...(body.startDate ? { start_date: body.startDate } : {}),
  })
  if (linked.error) {
    // Do not leave a half-made account behind.
    if (createdNow) await admin.auth.admin.deleteUser(userId)
    return fail(linked.error.code === '23505' ? 'already_linked' : 'failed')
  }

  // An existing person who never finished the invite page may get a fresh link, under the same rules.
  if (!createdNow && (await linkAllowed(admin, callerId, userId)) === 'ok') {
    link = await issueLink(admin, userId, redirectTo)
  }

  return json({ ok: true, status: createdNow ? 'invited' : 'linked', profileId: userId, link })
}

/** May the caller get a link for this person as a (pending) admin of THIS site? Applies decideAdminLink() to real data. */
async function adminLinkAllowed(admin: Admin, callerId: string, siteId: string, profileId: string): Promise<'ok' | ErrorCode> {
  const { data: profile } = await admin.from('profiles').select('id, is_active, kvkk_consent_at').eq('id', profileId).maybeSingle()
  if (!profile) return 'forbidden'
  const { data: member } = await admin.from('site_members').select('profile_id').eq('profile_id', profileId).eq('site_id', siteId).eq('role', 'admin').maybeSingle()
  const decision = decideAdminLink({
    isCaller: profileId === callerId,
    isActive: Boolean(profile.is_active),
    isAdminOfThisSite: Boolean(member),
    kvkkConsentAt: profile.kvkk_consent_at ?? null,
  })
  if (decision.allowed) return 'ok'
  return decision.reason === 'already_active' ? 'already_active' : 'forbidden'
}

async function inviteAdmin(admin: Admin, user: Admin, callerId: string, body: AdminInviteBody, redirectTo: string): Promise<Response> {
  // The caller must be an ACTIVE admin of the site named in the request. Any other answer is the same "forbidden".
  if (!(await isActiveSiteAdmin(admin, callerId, body.siteId))) return fail('forbidden')

  const { data: existing } = await admin.from('profiles').select('id, is_active').eq('email', body.email).maybeSingle()

  let userId: string
  let createdNow = false
  let link: string | null = null

  if (existing) {
    if (!existing.is_active) return fail('account_inactive')
    userId = existing.id
  } else {
    const { data, error } = await admin.auth.admin.generateLink({
      type: 'invite',
      email: body.email,
      options: { data: { full_name: body.fullName }, redirectTo },
    })
    if (error || !data?.user) {
      console.error('generateLink failed:', error?.code ?? 'no-user')
      return fail(error?.code === 'email_exists' ? 'email_in_use_elsewhere' : 'failed')
    }
    userId = data.user.id
    createdNow = true
    link = data.properties?.action_link ?? null
    if (body.phone) await admin.from('profiles').update({ phone: body.phone }).eq('id', userId)
  }

  // The database decides who may become an admin (another company, deactivated, already a member ...). It runs as the CALLER.
  const added = await user.rpc('add_site_admin', { p_site: body.siteId, p_profile: userId })
  if (added.error) {
    // Do not leave a half-made account behind.
    if (createdNow) await admin.auth.admin.deleteUser(userId)
    return fail(errorCodeForRpc(added.error))
  }

  // An existing person who never finished the invite page may get a fresh link, under the same rules.
  if (!createdNow && (await adminLinkAllowed(admin, callerId, body.siteId, userId)) === 'ok') {
    link = await issueLink(admin, userId, redirectTo)
  }

  return json({ ok: true, status: createdNow ? 'invited' : 'linked', profileId: userId, link })
}

async function adminRelink(admin: Admin, callerId: string, body: AdminLinkBody, redirectTo: string): Promise<Response> {
  if (!(await isActiveSiteAdmin(admin, callerId, body.siteId))) return fail('forbidden')
  const verdict = await adminLinkAllowed(admin, callerId, body.siteId, body.profileId)
  if (verdict !== 'ok') return fail(verdict)
  const link = await issueLink(admin, body.profileId, redirectTo)
  return link ? json({ ok: true, status: 'link', profileId: body.profileId, link }) : fail('failed')
}

async function relink(admin: Admin, callerId: string, profileId: string, redirectTo: string): Promise<Response> {
  // Which sites does this person live in, and does the caller administer one of them?
  const { data: rows } = await admin.from('unit_residents').select('units!inner(blocks!inner(site_id))').eq('profile_id', profileId)
  const siteIds = [...new Set<string>((rows ?? []).map((row: { units: { blocks: { site_id: string } } }) => row.units.blocks.site_id))]
  let callerManages = false
  for (const siteId of siteIds) {
    if (await isActiveSiteAdmin(admin, callerId, siteId)) {
      callerManages = true
      break
    }
  }
  if (!callerManages) return fail('forbidden')

  const verdict = await linkAllowed(admin, callerId, profileId)
  if (verdict !== 'ok') return fail(verdict)

  const link = await issueLink(admin, profileId, redirectTo)
  return link ? json({ ok: true, status: 'link', profileId, link }) : fail('failed')
}

// withSupabase({ auth: 'user' }) checks the caller's login token and gives us ctx.userClaims.
// CORS is switched off there because it only allows ONE origin; we answer it ourselves below.
// Note: Supabase's gateway can answer preflight requests and replace Access-Control-Allow-Origin by
// itself (the local stack sets "*"). That is fine: CORS is not what protects this function. The
// caller's login token, the Origin allow-list check above and the admin checks below are.
const handler = withSupabase({ auth: 'user', cors: 'disabled' }, async (req, ctx) => {
  const callerId = ctx.userClaims?.id
  if (!callerId) return fail('forbidden')

  const redirectTo = inviteRedirectFor(req.headers.get('Origin'))
  if (!redirectTo) return fail('origin_not_allowed')

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return fail('invalid_request')
  }
  const parsed = parseRequest(raw)
  if (!parsed.ok) return fail('invalid_request')

  try {
    const admin = ctx.supabaseAdmin as Admin
    const user = ctx.supabase as Admin // acts as the caller: row security and auth.uid() are the caller's
    switch (parsed.value.action) {
      case 'invite':
        return await invite(admin, callerId, parsed.value, redirectTo)
      case 'link':
        return await relink(admin, callerId, parsed.value.profileId, redirectTo)
      case 'invite-admin':
        return await inviteAdmin(admin, user, callerId, parsed.value, redirectTo)
      case 'admin-link':
        return await adminRelink(admin, callerId, parsed.value, redirectTo)
    }
  } catch (error) {
    console.error('invite-resident failed:', error instanceof Error ? error.name : 'unknown')
    return fail('failed')
  }
})

export default {
  fetch: async (req: Request): Promise<Response> => {
    const cors = corsHeadersFor(req.headers.get('Origin'))
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    if (req.method !== 'POST') return new Response(JSON.stringify({ ok: false, error: 'invalid_request' }), { status: 405, headers: { ...cors, 'Content-Type': 'application/json' } })

    const response = await handler(req)
    const headers = new Headers(response.headers)
    for (const [key, value] of Object.entries(cors)) headers.set(key, value)
    return new Response(response.body, { status: response.status, headers })
  },
}
