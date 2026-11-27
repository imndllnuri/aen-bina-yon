// Real-browser check of slice 13 (Yöneticiler: list, invite, new link, remove) against the LOCAL stack, including the invite function.
//   npx supabase start (WITH the function runtime) ; npx supabase db reset ; PORT=5173 scripts/dev/dev-local.sh
//   OUT_DIR=/some/folder node scripts/dev/browser-s13.mjs
// Keys are read from the local stack at run time. Never run this against the live project.
import { execSync } from 'node:child_process'
import { chromium } from 'playwright'

const ROOT = new URL('../..', import.meta.url).pathname
const OUT = process.env.OUT_DIR || '/tmp'
const status = execSync('npx supabase status -o env', { cwd: ROOT, env: { ...process.env, CI: '1' }, stdio: ['ignore', 'pipe', 'ignore'] }).toString()
const env = Object.fromEntries(status.split('\n').map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/)).filter(Boolean).map((m) => [m[1], m[2]]))
const API = env.API_URL, SECRET = env.SECRET_KEY, PUB = env.PUBLISHABLE_KEY, DB = env.DB_URL
if (!API?.includes('127.0.0.1') || !SECRET || !PUB) throw new Error('This script runs against the local stack only.')
const APP = 'http://localhost:5173/aen-bina-yon/' // the only local origin the invite function accepts
const SITE = '00000000-0000-0000-0000-000000000010'
const BLOCK_A = '00000000-0000-0000-0000-000000000101'

let ok = 0, fail = 0
const failed = []
const check = (name, cond, detail = '') => {
  if (cond) { ok++; console.log('  ok  ', name) } else { fail++; failed.push(name); console.log('  FAIL', name, detail) }
}
const sql = (q) => execSync(`psql "${DB}" -v ON_ERROR_STOP=1 -tA`, { input: q }).toString().trim()
const J = { 'content-type': 'application/json' }
const secretHeaders = { apikey: SECRET, authorization: `Bearer ${SECRET}`, ...J }
const rest = async (path, { method = 'GET', body, token } = {}) => {
  const r = await fetch(`${API}/rest/v1/${path}`, { method, headers: { apikey: PUB, authorization: `Bearer ${token ?? PUB}`, ...J }, body: body ? JSON.stringify(body) : undefined })
  const text = await r.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* not json */ }
  return { status: r.status, json, text }
}
const suffix = Date.now().toString(36)
const PASS = 'Test-12345678'
const NEW_PASS = 'Yeni-Sifre-98765'
const newUser = async (tag, name) => {
  const email = `${tag}-${suffix}@s13.local`
  const r = await fetch(`${API}/auth/v1/admin/users`, { method: 'POST', headers: secretHeaders, body: JSON.stringify({ email, password: PASS, email_confirm: true, user_metadata: { full_name: name } }) })
  const u = await r.json()
  if (!u.id) throw new Error('could not create user ' + JSON.stringify(u))
  return { id: u.id, email }
}
const token = async (who) => (await (await fetch(`${API}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: PUB, ...J }, body: JSON.stringify({ email: who.email, password: PASS }) })).json()).access_token
const admins = () => sql(`select string_agg(p.full_name, ',' order by m.created_at, p.full_name) from public.site_members m join public.profiles p on p.id = m.profile_id where m.site_id = '${SITE}' and m.role = 'admin'`)

console.log('SETUP')
const a1 = await newUser('a1', 'Yönetici Bir')
const a2 = await newUser('a2', 'Bekleyen Yönetici')
const res = await newUser('res', 'Zeynep Sakin')
const other = await newUser('other', 'Başka Firma Yöneticisi')
await fetch(`${API}/rest/v1/site_members`, { method: 'POST', headers: secretHeaders, body: JSON.stringify([{ profile_id: a1.id, site_id: SITE, role: 'admin' }, { profile_id: a2.id, site_id: SITE, role: 'admin' }]) })
const units = await (await fetch(`${API}/rest/v1/units?block_id=eq.${BLOCK_A}&select=id,door_no&order=door_no`, { headers: secretHeaders })).json()
await fetch(`${API}/rest/v1/unit_residents`, { method: 'POST', headers: secretHeaders, body: JSON.stringify({ unit_id: units.find((u) => u.door_no === '1').id, profile_id: res.id, relation: 'owner', start_date: '2026-01-01' }) })
sql(`insert into public.companies (id, name) values ('10000000-0000-0000-0000-0000000000f9', 'Başka Firma') on conflict do nothing;
     insert into public.sites (id, company_id, name) values ('20000000-0000-0000-0000-0000000000f9', '10000000-0000-0000-0000-0000000000f9', 'Başka Site') on conflict do nothing;
     insert into public.site_members (profile_id, site_id, role) values ('${other.id}', '20000000-0000-0000-0000-0000000000f9', 'admin');
     update public.profiles set kvkk_consent_at = now(), kvkk_consent_version = 'test' where id in ('${a1.id}', '${res.id}', '${other.id}');`)
// Yönetici Bir is the OLDEST admin; Bekleyen Yönetici has not finished the invite page
sql(`update public.site_members set created_at = now() - interval '20 days' where profile_id = '${a1.id}'; update public.site_members set created_at = now() - interval '3 days' where profile_id = '${a2.id}'`)
console.log('  users: two admins (one pending), a resident who finished onboarding, an admin of another company')

const browser = await chromium.launch()
const errors = []
const watch = (page, label) => {
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${label}: ${m.text()}`) })
  page.on('pageerror', (e) => errors.push(`${label} pageerror: ${e.message}`))
}
const signIn = async (page, who, password = PASS) => {
  await page.goto(`${APP}#/giris`)
  await page.getByLabel('E-posta').fill(who.email)
  await page.getByLabel('Şifre', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Giriş yap' }).click()
  await page.waitForURL(/#\/(panel|yonetim)/)
}
const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
const toastSeen = (page, text) => page.getByText(text).first().waitFor({ timeout: 10000 }).then(() => true, () => false)

console.log('1. THE LIST')
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1100 } })
const page = await ctx.newPage()
watch(page, 'admin1')
await signIn(page, a1)
await page.getByRole('heading', { level: 1, name: 'Genel Bakış' }).waitFor()
await page.getByRole('navigation', { name: 'Ana menü' }).getByRole('link', { name: 'Yöneticiler' }).click()
await page.getByRole('heading', { level: 1, name: 'Yöneticiler' }).waitFor()
const list = page.getByRole('list', { name: 'Yöneticiler' })
await list.waitFor()
check('the menu opens /yonetim/yoneticiler', page.url().endsWith('#/yonetim/yoneticiler'))
const shownNames = (await list.getByRole('listitem').locator('p.font-medium').allTextContents()).map((t) => t.replace(/\s+/g, ' ').trim())
check('the list shows the two admins, oldest first', JSON.stringify(shownNames) === JSON.stringify(['Yönetici Bir Siz', 'Bekleyen Yönetici']), JSON.stringify(shownNames))
const own = list.getByRole('listitem').filter({ hasText: 'Yönetici Bir' })
check('the caller is marked "Siz" and "Etkin", and has no remove button', (await own.getByText('Siz').isVisible()) && (await own.getByText('Etkin').isVisible()) && (await own.getByRole('button').count()) === 0)
const pend = list.getByRole('listitem').filter({ hasText: 'Bekleyen Yönetici' })
check('the pending admin shows "Davet bekliyor" with "Yeni bağlantı" and a remove button', (await pend.getByText('Davet bekliyor').isVisible()) && (await pend.getByRole('button', { name: /yeni bağlantı/ }).isVisible()) && (await pend.getByRole('button', { name: /yöneticiliğini kaldır/ }).isVisible()))
await page.screenshot({ path: `${OUT}/s13-list.png`, fullPage: true })

console.log('2. A NEW ADMIN IS INVITED (the whole way, with a real link)')
await page.getByRole('button', { name: 'Yönetici davet et' }).click()
let dialog = page.getByRole('dialog')
await dialog.getByRole('button', { name: 'Yönetici yap ve davet et' }).click()
check('an empty form shows messages and sends nothing', (await dialog.getByText('Ad soyad en az 2 karakter olmalı.').isVisible()) && admins() === 'Yönetici Bir,Bekleyen Yönetici')
await dialog.getByLabel(/Ad soyad/).fill('Ece Yeni Yönetici')
await dialog.getByLabel(/E-posta/).fill(`ece-${suffix}@s13.local`)
await dialog.getByLabel('Telefon').fill('0532 000 00 00')
await dialog.getByRole('button', { name: 'Yönetici yap ve davet et' }).click()
const linkDialog = page.getByRole('dialog', { name: 'Davet bağlantısı hazır' })
await linkDialog.waitFor({ timeout: 15000 })
const link = await linkDialog.getByLabel('Bağlantı').inputValue()
check('a one-time link is shown (as an admin invite)', link.includes('/auth/v1/verify') && (await linkDialog.getByText(/\(yönetici olarak\)/).isVisible()))
check('the WhatsApp text says "as an admin"', decodeURIComponent(await linkDialog.getByRole('link', { name: /WhatsApp/ }).getAttribute('href')).includes('yönetici olarak davet edildiniz'))
check('the database has the new admin of the site, onboarding still open', admins() === 'Yönetici Bir,Bekleyen Yönetici,Ece Yeni Yönetici' && sql(`select (p.kvkk_consent_at is null) from public.profiles p where p.email = 'ece-${suffix}@s13.local'`) === 't')
const eceId = sql(`select id from public.profiles where email = 'ece-${suffix}@s13.local'`)
check('the audit log names the admin who invited (Yönetici Bir)', sql(`select count(*) from public.audit_log where table_name = 'site_members' and action = 'insert' and row_id = '${eceId}' and actor_id = '${a1.id}' and actor_name = 'Yönetici Bir'`) === '1')
await page.screenshot({ path: `${OUT}/s13-link.png` })
await linkDialog.getByRole('button', { name: 'Kapat' }).click()
check('the list now shows the new admin as "Davet bekliyor"', await page.getByRole('list', { name: 'Yöneticiler' }).getByRole('listitem').filter({ hasText: 'Ece Yeni Yönetici' }).getByText('Davet bekliyor').waitFor({ timeout: 8000 }).then(() => true, () => false))

// the new admin clicks the link in a fresh browser and finishes the invite page
const newCtx = await browser.newContext({ viewport: { width: 1280, height: 1100 } })
const np = await newCtx.newPage()
watch(np, 'new-admin')
await np.goto(link)
const pw = np.getByLabel(/^Yeni şifre( \*)?$/)
await pw.waitFor({ timeout: 15000 })
await pw.fill(NEW_PASS)
await np.getByLabel(/Yeni şifre \(tekrar\)/).fill(NEW_PASS)
await np.getByRole('checkbox', { name: /KVKK Aydınlatma Metni/ }).click()
await np.locator('form').getByRole('button').last().click()
await np.waitForURL(/#\/yonetim/, { timeout: 15000 })
check('the new admin finishes the invite page and lands in the ADMIN panel', np.url().includes('#/yonetim'))
await np.getByRole('navigation', { name: 'Ana menü' }).getByRole('link', { name: 'Yöneticiler' }).click()
await np.getByRole('list', { name: 'Yöneticiler' }).waitFor()
check('...and sees the admin list, with "Siz" on their own row and all four people', (await np.getByRole('list', { name: 'Yöneticiler' }).getByRole('listitem').count()) === 3 && (await np.getByRole('list', { name: 'Yöneticiler' }).getByRole('listitem').filter({ hasText: 'Ece Yeni Yönetici' }).getByText('Siz').isVisible()))
check('the consent is recorded now', sql(`select (kvkk_consent_at is not null) from public.profiles where id = '${eceId}'`) === 't')
await page.reload()
check('the first admin now sees the new admin as "Etkin"', await page.getByRole('list', { name: 'Yöneticiler' }).getByRole('listitem').filter({ hasText: 'Ece Yeni Yönetici' }).getByText('Etkin').waitFor({ timeout: 8000 }).then(() => true, () => false))

console.log('3. AN EXISTING PERSON, AND A NEW LINK')
await page.getByRole('button', { name: 'Yönetici davet et' }).click()
dialog = page.getByRole('dialog')
await dialog.getByLabel(/Ad soyad/).fill('Zeynep Sakin')
await dialog.getByLabel(/E-posta/).fill(res.email)
await dialog.getByRole('button', { name: 'Yönetici yap ve davet et' }).click()
check('a resident who finished onboarding becomes admin with NO link', (await toastSeen(page, 'Kişi yönetici yapıldı. Hesabını zaten kullandığı için yeni bir bağlantı gerekmez.')) && (await page.getByRole('dialog', { name: 'Davet bağlantısı hazır' }).count()) === 0)
check('...and is an admin in the database (and still a resident)', admins().includes('Zeynep Sakin') && sql(`select count(*) from public.unit_residents where profile_id = '${res.id}'`) === '1')
await page.getByRole('button', { name: 'Yönetici davet et' }).click()
dialog = page.getByRole('dialog')
await dialog.getByLabel(/Ad soyad/).fill('Zeynep Sakin')
await dialog.getByLabel(/E-posta/).fill(res.email)
await dialog.getByRole('button', { name: 'Yönetici yap ve davet et' }).click()
check('inviting the same person again says "zaten bu sitenin yöneticisi"', await dialog.getByText('Bu kişi zaten bu sitenin yöneticisi.').waitFor({ timeout: 10000 }).then(() => true, () => false))
await dialog.getByLabel(/E-posta/).fill(other.email)
await dialog.getByLabel(/Ad soyad/).fill('Başka Firma Yöneticisi')
await dialog.getByRole('button', { name: 'Yönetici yap ve davet et' }).click()
check('an account of ANOTHER company is refused in Turkish', await dialog.getByText(/başka bir firmanın hesabında kullanılıyor/).waitFor({ timeout: 10000 }).then(() => true, () => false))
check('...and nothing was attached to it', sql(`select count(*) from public.site_members where profile_id = '${other.id}' and site_id = '${SITE}'`) === '0')
await dialog.getByRole('button', { name: 'Vazgeç' }).click()
await pend.getByRole('button', { name: /yeni bağlantı/ }).click()
const fresh = page.getByRole('dialog', { name: 'Davet bağlantısı hazır' })
await fresh.waitFor({ timeout: 15000 })
check('"Yeni bağlantı" gives a fresh link for the pending admin', (await fresh.getByLabel('Bağlantı').inputValue()).includes('/auth/v1/verify') && (await fresh.getByText('Bekleyen Yönetici').isVisible()))
await fresh.getByRole('button', { name: 'Kapat' }).click()

console.log('4. REMOVING AN ADMIN')
await page.getByRole('list', { name: 'Yöneticiler' }).getByRole('listitem').filter({ hasText: 'Bekleyen Yönetici' }).getByRole('button', { name: /yöneticiliğini kaldır/ }).click()
const confirm = page.getByRole('dialog')
check('it asks first and says what stays', (await confirm.getByText('Yöneticilik kaldırılsın mı?').isVisible()) && (await confirm.getByText(/Hesabı ve varsa daire kaydı silinmez/).isVisible()))
await confirm.getByRole('button', { name: 'Vazgeç' }).click()
check('"Vazgeç" removes nobody', admins().includes('Bekleyen Yönetici'))
await page.getByRole('list', { name: 'Yöneticiler' }).getByRole('listitem').filter({ hasText: 'Bekleyen Yönetici' }).getByRole('button', { name: /yöneticiliğini kaldır/ }).click()
await page.getByRole('dialog').getByRole('button', { name: 'Kaldır' }).click()
check('confirming removes the admin', (await toastSeen(page, 'Yöneticilik kaldırıldı.')) && !admins().includes('Bekleyen Yönetici'))
check('the removed person keeps their account', sql(`select count(*) from public.profiles where id = '${a2.id}'`) === '1')
check('the audit log names the admin who removed (Yönetici Bir)', sql(`select count(*) from public.audit_log where table_name = 'site_members' and action = 'delete' and row_id = '${a2.id}' and actor_id = '${a1.id}'`) === '1')
await page.getByRole('heading', { level: 1, name: 'Yöneticiler' }).waitFor()
check('the list no longer shows them', (await page.getByRole('list', { name: 'Yöneticiler' }).getByText('Bekleyen Yönetici').count()) === 0)
await page.goto(`${APP}#/yonetim/islem-gecmisi`)
await page.getByRole('table', { name: 'İşlem geçmişi' }).waitFor()
const logText = await page.getByRole('table', { name: 'İşlem geçmişi' }).innerText()
check('İşlem Geçmişi shows who was ADDED and who was REMOVED, by name, and who did it', /Yönetici Bir\s+Eklendi\s+Yönetici\s+Yönetici: Ece Yeni Yönetici/.test(logText) && /Yönetici Bir\s+Silindi\s+Yönetici\s+Yönetici: Bekleyen Yönetici/.test(logText), logText.replace(/\s+/g, ' ').slice(0, 700))

console.log('5. THE DATABASE REFUSES THE WRONG WAYS (real tokens)')
const t1 = await token(a1)
let r = await rest('rpc/remove_site_admin', { method: 'POST', token: t1, body: { p_site: SITE, p_profile: a1.id } })
check('an admin cannot remove themselves (' + r.status + ')', r.status === 400 && r.text.includes('cannot_remove_self'), r.text.slice(0, 120))
r = await rest(`site_members?profile_id=eq.${eceId}`, { method: 'DELETE', token: t1 })
check('an admin cannot delete a site_members row directly (' + r.status + ')', r.status === 401 || r.status === 403, r.text.slice(0, 120))
r = await rest('site_members', { method: 'POST', token: t1, body: { profile_id: a2.id, site_id: SITE, role: 'admin' } })
check('...nor insert one (' + r.status + ')', r.status === 401 || r.status === 403, r.text.slice(0, 120))
r = await rest(`site_members?profile_id=eq.${eceId}`, { method: 'PATCH', token: t1, body: { role: 'staff' } })
check('...nor change a role (' + r.status + ')', r.status === 401 || r.status === 403, r.text.slice(0, 120))
const tOther = await token(other)
r = await rest('rpc/list_site_admins', { method: 'POST', token: tOther, body: { p_site: SITE } })
check('an admin of another company cannot list these admins (' + r.status + ')', r.status === 403, r.text.slice(0, 120))
r = await rest('rpc/add_site_admin', { method: 'POST', token: tOther, body: { p_site: SITE, p_profile: a2.id } })
check('...nor add one (' + r.status + ')', r.status === 403, r.text.slice(0, 120))
const tRes = await token({ email: `res-${suffix}@s13.local` })
r = await rest('rpc/add_site_admin', { method: 'POST', body: { p_site: SITE, p_profile: a2.id } })
check('a visitor cannot add (' + r.status + ')', r.status === 401 || r.status === 403, r.text.slice(0, 120))
check('the site still has its admins', admins() === 'Yönetici Bir,Ece Yeni Yönetici,Zeynep Sakin', admins())

console.log('6. THE REMOVED PERSON AND OTHERS')
const gone = await browser.newContext()
const gp = await gone.newPage()
await signIn(gp, a2).catch(() => {})
await gp.waitForTimeout(1500)
await gp.goto(`${APP}#/yonetim/yoneticiler`)
await gp.waitForTimeout(1500)
check('the removed admin cannot open the Yöneticiler page any more', (await gp.getByRole('heading', { level: 1, name: 'Yöneticiler' }).count()) === 0)
await gone.close()
const rc = await browser.newContext()
const rp = await rc.newPage()
await signIn(rp, other)
await rp.goto(`${APP}#/yonetim/yoneticiler`)
await rp.getByRole('heading', { level: 1, name: 'Yöneticiler' }).waitFor()
await rp.getByRole('list', { name: 'Yöneticiler' }).waitFor()
const otherNames = (await rp.getByRole('list', { name: 'Yöneticiler' }).getByRole('listitem').locator('p.font-medium').allTextContents()).map((t) => t.replace(/\s+/g, ' ').trim())
check('an admin of ANOTHER company sees only their own site\'s admin (not these)', otherNames.length === 1 && !(await rp.getByText('Yönetici Bir').count()), JSON.stringify(otherNames) + ' sites: ' + (await rp.locator('main').innerText()).replace(/\s+/g, ' ').slice(0, 200))
await rc.close()
await newCtx.close()

console.log('7. PHONE (390 px)')
const pctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
const pp = await pctx.newPage()
watch(pp, 'phone')
await signIn(pp, a1)
await pp.goto(`${APP}#/yonetim/yoneticiler`)
await pp.getByRole('list', { name: 'Yöneticiler' }).waitFor()
check('the page fits a phone', await noSideScroll(pp))
await pp.getByRole('button', { name: 'Yönetici davet et' }).click()
check('the invite window fits a phone', await noSideScroll(pp))
await pp.screenshot({ path: `${OUT}/s13-phone.png` })
await pctx.close()

console.log('\nCONSOLE')
const allowed = (m) => /status of 4\d\d/.test(m)
const unexpected = errors.filter((m) => !allowed(m))
check('no unexpected console or page error', unexpected.length === 0, '\n' + unexpected.join('\n'))
await browser.close()
console.log(`\n${ok} passed, ${fail} failed`)
if (fail) console.log('FAILED:\n - ' + failed.join('\n - '))
process.exit(fail ? 1 : 0)
