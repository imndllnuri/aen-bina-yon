// Integration test for the invite-resident Edge Function, against the LOCAL Supabase stack.
//
//   npx supabase start        (the function runtime must be running: do not exclude edge-runtime)
//   npm run test:functions
//
// It calls the real function with real login tokens from different kinds of people and checks the
// answers AND the database. It creates its own data (random names) and removes it at the end.
// Needs: psql, and the local stack. Never run it against the hosted project.
import { execSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'

const ROOT = new URL('..', import.meta.url).pathname
const DB = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const API = 'http://127.0.0.1:54321'
const FUNCTION_URL = `${API}/functions/v1/invite-resident`
const ORIGIN = 'http://localhost:5173'

// ---- keys of the local stack (demo keys, only valid on this machine) ----
const status = execSync('npx supabase status -o env', { cwd: ROOT, env: { ...process.env, CI: '1' }, stdio: ['ignore', 'pipe', 'ignore'] }).toString()
const env = Object.fromEntries(
  status.split('\n').map((line) => line.match(/^([A-Z_]+)="?(.*?)"?$/)).filter(Boolean).map((m) => [m[1], m[2]]),
)
const SERVICE = env.SERVICE_ROLE_KEY
const PUBLISHABLE = env.PUBLISHABLE_KEY
if (!SERVICE || !PUBLISHABLE) throw new Error('Could not read the local keys. Is `npx supabase start` running?')
if (!API.includes('127.0.0.1')) throw new Error('Refusing to run against anything but the local stack')

const startedAt = new Date().toISOString()
const results = []
const check = (name, ok, detail = '') => {
  results.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? '  -> ' + detail : ''}`)
}

const sql = (query) => execSync(`psql "${DB}" -v ON_ERROR_STOP=1 -tA`, { input: query }).toString().trim()
const adminApi = async (path, body, method = 'POST') => {
  const response = await fetch(`${API}/auth/v1/admin/${path}`, {
    method,
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  return response.json().catch(() => ({}))
}

const suffix = Date.now().toString(36)
const emailOf = (name) => `${name}-${suffix}@fn-test.local`
const PASSWORD = 'Fn-test-pass-12345'

// ---- fixtures ----
const ids = Object.fromEntries(
  ['company1', 'site1', 'block1', 'unit1a', 'unit1b', 'unit1c', 'company2', 'site2', 'block2', 'unit2a'].map((key) => [key, randomUUID()]),
)
const users = {}
async function makeUser(name, fullName) {
  const created = await adminApi('users', { email: emailOf(name), password: PASSWORD, email_confirm: true, user_metadata: { full_name: fullName } })
  if (!created.id) throw new Error(`could not create ${name}: ${JSON.stringify(created)}`)
  users[name] = { id: created.id, email: emailOf(name) }
}

async function token(name) {
  const response = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: PUBLISHABLE, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: users[name].email, password: PASSWORD }),
  })
  const body = await response.json()
  if (!body.access_token) throw new Error(`login failed for ${name}: ${JSON.stringify(body)}`)
  return body.access_token
}

async function call(who, body, { origin = ORIGIN, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json', apikey: PUBLISHABLE }
  if (origin) headers.Origin = origin
  if (auth) headers.Authorization = `Bearer ${await token(who)}`
  const response = await fetch(FUNCTION_URL, { method: 'POST', headers, body: JSON.stringify(body) })
  const text = await response.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* not json */ }
  return { status: response.status, json, headers: response.headers }
}

const invite = (overrides = {}) => ({
  action: 'invite', email: emailOf('newperson'), fullName: 'Yeni Kişi', phone: '0532 111 22 33',
  unitId: ids.unit1a, relation: 'owner', ...overrides,
})

try {
  sql(`
    insert into public.companies (id, name) values ('${ids.company1}', 'FN Test 1'), ('${ids.company2}', 'FN Test 2');
    insert into public.sites (id, company_id, name) values ('${ids.site1}', '${ids.company1}', 'FN Site 1'), ('${ids.site2}', '${ids.company2}', 'FN Site 2');
    insert into public.blocks (id, site_id, name) values ('${ids.block1}', '${ids.site1}', 'A'), ('${ids.block2}', '${ids.site2}', 'A');
    insert into public.units (id, block_id, door_no, archived_at) values
      ('${ids.unit1a}', '${ids.block1}', '1', null), ('${ids.unit1b}', '${ids.block1}', '2', null),
      ('${ids.unit1c}', '${ids.block1}', '3', now()), ('${ids.unit2a}', '${ids.block2}', '1', null);`)
  for (const [name, full] of [['adminA', 'Admin A'], ['adminB', 'Admin B'], ['inactiveAdmin', 'Eski Admin'], ['staff', 'Görevli'], ['resident', 'Sakin Aktif'], ['stranger', 'Yabancı']]) {
    await makeUser(name, full)
  }
  sql(`
    insert into public.site_members (profile_id, site_id, role) values
      ('${users.adminA.id}', '${ids.site1}', 'admin'), ('${users.adminB.id}', '${ids.site2}', 'admin'),
      ('${users.inactiveAdmin.id}', '${ids.site1}', 'admin'), ('${users.staff.id}', '${ids.site1}', 'staff');
    update public.profiles set is_active = false where id = '${users.inactiveAdmin.id}';
    -- "resident" finished onboarding long ago: consent recorded
    update public.profiles set kvkk_consent_at = now(), kvkk_consent_version = 'test' where id = '${users.resident.id}';
    insert into public.unit_residents (unit_id, profile_id, relation) values ('${ids.unit1b}', '${users.resident.id}', 'owner');`)

  console.log('--- who may call ---')
  const noLogin = await call(null, invite(), { auth: false })
  check('1  no login -> 401', noLogin.status === 401, JSON.stringify(noLogin.json))
  const unknownSite = await call('adminA', invite(), { origin: 'https://evil.example' })
  check('2  a call from an unknown website -> 403 origin_not_allowed', unknownSite.status === 403 && unknownSite.json?.error === 'origin_not_allowed', JSON.stringify(unknownSite.json))
  const asResident = await call('resident', invite({ email: emailOf('x1') }))
  check('3  a resident -> 403 forbidden', asResident.status === 403 && asResident.json?.error === 'forbidden', JSON.stringify(asResident.json))
  const asStranger = await call('stranger', invite({ email: emailOf('x2') }))
  check('4  someone with no role -> 403', asStranger.status === 403)
  const asOtherAdmin = await call('adminB', invite({ email: emailOf('x3') }))
  check('5  an admin of ANOTHER site/company -> 403', asOtherAdmin.status === 403 && asOtherAdmin.json?.error === 'forbidden', JSON.stringify(asOtherAdmin.json))
  const asInactive = await call('inactiveAdmin', invite({ email: emailOf('x4') }))
  check('6  a DEACTIVATED admin of this site -> 403', asInactive.status === 403, JSON.stringify(asInactive.json))
  const asStaff = await call('staff', invite({ email: emailOf('x5') }))
  check('7  a staff member (not admin) of this site -> 403', asStaff.status === 403)
  const unknownUnit = await call('adminA', invite({ unitId: randomUUID(), email: emailOf('x6') }))
  check('8  an unknown unit gives the SAME 403 (no way to probe which units exist)', unknownUnit.status === 403 && unknownUnit.json?.error === 'forbidden')
  const badBody = await call('adminA', { action: 'invite', email: 'not-an-email' })
  check('9  a broken request -> 400', badBody.status === 400 && badBody.json?.error === 'invalid_request')
  const archived = await call('adminA', invite({ unitId: ids.unit1c, email: emailOf('x7') }))
  check('10 an archived unit -> 404 unit_not_found', archived.status === 404 && archived.json?.error === 'unit_not_found', JSON.stringify(archived.json))
  const leaked = sql(`select count(*) from auth.users where email in ('${emailOf('x1')}','${emailOf('x2')}','${emailOf('x3')}','${emailOf('x4')}','${emailOf('x5')}','${emailOf('x6')}','${emailOf('x7')}')`)
  check('11 none of the refused calls created an account', leaked === '0', `${leaked} accounts`)

  console.log('--- the right admin invites a new person ---')
  const ok = await call('adminA', invite({ startDate: '2026-10-01' }))
  check('12 invite -> 200 status "invited" with a link', ok.status === 200 && ok.json?.ok === true && ok.json?.status === 'invited' && typeof ok.json?.link === 'string', JSON.stringify(ok.json))
  const link = ok.json?.link ?? ''
  check('13 the link goes through Supabase and returns to the site with ?flow=invite', link.includes('/auth/v1/verify') && decodeURIComponent(link).includes('redirect_to=http://localhost:5173/aen-bina-yon/?flow=invite'), link.slice(0, 140))
  // The platform gateway may replace this header itself (the local one answers "*"). It must still be
  // ONE clean value: the caller's address or "*", never two values joined by a comma.
  const allowOrigin = ok.headers.get('access-control-allow-origin')
  check('14 the answer carries exactly one valid Access-Control-Allow-Origin value', allowOrigin === ORIGIN || allowOrigin === '*', String(allowOrigin))
  const row = sql(`select p.full_name, p.phone, p.is_active, (p.kvkk_consent_at is null) as pending, r.relation, r.start_date, r.end_date is null
                   from public.profiles p join public.unit_residents r on r.profile_id = p.id
                   where p.email = '${emailOf('newperson')}' and r.unit_id = '${ids.unit1a}'`)
  check('15 profile + residency were created with name, phone, relation and start date', row === 'Yeni Kişi|0532 111 22 33|t|t|owner|2026-10-01|t', row)

  console.log('--- invite again / existing people ---')
  const again = await call('adminA', invite())
  check('16 the same person, same unit, same relation -> 409 already_linked', again.status === 409 && again.json?.error === 'already_linked', JSON.stringify(again.json))
  const accounts = sql(`select count(*) from auth.users where email = '${emailOf('newperson')}'`)
  check('17 ...and still only one account', accounts === '1')
  const second = await call('adminA', invite({ unitId: ids.unit1b, relation: 'tenant' }))
  check('18 the same pending person gets a SECOND unit (as tenant) and a fresh link', second.status === 200 && second.json?.status === 'linked' && typeof second.json?.link === 'string', JSON.stringify(second.json))
  const old = await fetch(link, { redirect: 'manual' })
  check('19 ...and the FIRST link stopped working', (old.headers.get('location') ?? '').includes('error_code=otp_expired'), old.headers.get('location') ?? '')
  const onboarded = await call('adminA', invite({ email: users.resident.email, fullName: 'Sakin Aktif', unitId: ids.unit1a, relation: 'tenant' }))
  check('20 an already ACTIVE resident is linked to the unit but gets NO link (no impersonation)', onboarded.status === 200 && onboarded.json?.status === 'linked' && onboarded.json?.link === null, JSON.stringify(onboarded.json))
  const elsewhere = await call('adminA', invite({ email: users.adminB.email, fullName: 'Admin B' }))
  check('21 an account from ANOTHER company is not linked -> 409 email_in_use_elsewhere', elsewhere.status === 409 && elsewhere.json?.error === 'email_in_use_elsewhere', JSON.stringify(elsewhere.json))
  const leakRow = sql(`select count(*) from public.unit_residents where profile_id = '${users.adminB.id}'`)
  check('22 ...and nothing was attached to that account', leakRow === '0')
  sql(`update public.profiles set is_active = false where id = '${users.stranger.id}'; insert into public.unit_residents (unit_id, profile_id, relation) values ('${ids.unit1b}', '${users.stranger.id}', 'tenant')`)
  const inactive = await call('adminA', invite({ email: users.stranger.email, fullName: 'Yabancı', unitId: ids.unit1a }))
  check('23 a DEACTIVATED account cannot be linked again -> 409 account_inactive', inactive.status === 409 && inactive.json?.error === 'account_inactive', JSON.stringify(inactive.json))

  console.log('--- "link" action: a fresh link for a resident who has not finished ---')
  const pendingId = sql(`select id from public.profiles where email = '${emailOf('newperson')}'`)
  const fresh = await call('adminA', { action: 'link', profileId: pendingId })
  check('24 a pending resident -> a link (invite type, never clicked)', fresh.status === 200 && typeof fresh.json?.link === 'string' && fresh.json.link.includes('type=invite'), JSON.stringify(fresh.json))
  await fetch(fresh.json.link, { redirect: 'manual' }) // the person clicks it, but never finishes
  const afterClick = await call('adminA', { action: 'link', profileId: pendingId })
  check('25 after the click (confirmed, not finished) the new link is a recovery type', afterClick.status === 200 && afterClick.json?.link?.includes('type=recovery'), JSON.stringify(afterClick.json))
  const done = await call('adminA', { action: 'link', profileId: users.resident.id })
  check('26 a resident who FINISHED onboarding -> 409 already_active, no link', done.status === 409 && done.json?.error === 'already_active' && !done.json?.link, JSON.stringify(done.json))
  const forStaff = await call('adminA', { action: 'link', profileId: users.staff.id })
  check('27 a link for a staff member -> 403', forStaff.status === 403)
  const forSelf = await call('adminA', { action: 'link', profileId: users.adminA.id })
  check('28 a link for yourself -> 403', forSelf.status === 403)
  const forOther = await call('adminB', { action: 'link', profileId: pendingId })
  check('29 an admin of another company asks for this site\'s resident -> 403', forOther.status === 403)
  const forGhost = await call('adminA', { action: 'link', profileId: randomUUID() })
  check('30 an unknown profile -> the same 403', forGhost.status === 403 && forGhost.json?.error === 'forbidden')
  const forInactive = await call('adminA', { action: 'link', profileId: users.stranger.id })
  check('31 a deactivated resident -> 403', forInactive.status === 403)
  const asResidentLink = await call('resident', { action: 'link', profileId: pendingId })
  check('32 a resident asking for someone else\'s link -> 403', asResidentLink.status === 403)

  console.log('--- hygiene ---')
  const logs = execSync(`docker logs --since ${startedAt} supabase_edge_runtime_aen-bina-yon 2>&1 || true`).toString()
  const leakedInLogs = /access_token|refresh_token|verify\?token|action_link|token_hash/i.test(logs)
  check('33 no link or token appears in the function logs', !leakedInLogs, leakedInLogs ? logs.split('\n').filter((l) => /token|action_link/i.test(l)).slice(0, 2).join(' | ') : '')
} finally {
  // ---- cleanup (never leave test data behind) ----
  try {
    const emails = Object.values(users).map((u) => `'${u.email}'`).concat([`'${emailOf('newperson')}'`])
    sql(`delete from public.unit_residents where profile_id in (select id from public.profiles where email in (${emails.join(',')}));
         delete from public.site_members where site_id in ('${ids.site1}', '${ids.site2}');`)
    for (const user of Object.values(users)) await adminApi(`users/${user.id}`, null, 'DELETE')
    const leftover = sql(`select id from auth.users where email = '${emailOf('newperson')}'`)
    if (leftover) await adminApi(`users/${leftover}`, null, 'DELETE')
    sql(`delete from public.units where block_id in ('${ids.block1}', '${ids.block2}');
         delete from public.blocks where site_id in ('${ids.site1}', '${ids.site2}');
         delete from public.sites where company_id in ('${ids.company1}', '${ids.company2}');
         delete from public.companies where id in ('${ids.company1}', '${ids.company2}');`)
  } catch (error) {
    console.error('cleanup problem:', error.message)
  }
}

const failed = results.filter((ok) => !ok).length
console.log(`\n${results.length - failed}/${results.length} checks passed`)
process.exit(failed ? 1 : 0)
