// Real-browser check of slice 11 (the Profil page) against the LOCAL stack.
//   npx supabase start ; npx supabase db reset ; scripts/dev/dev-local.sh   (dev server on port 5199)
//   OUT_DIR=/some/folder node scripts/dev/browser-s11.mjs
// Keys are read from the local stack at run time. Never run this against the live project.
import { execSync } from 'node:child_process'
import { chromium } from 'playwright'

const ROOT = new URL('../..', import.meta.url).pathname
const OUT = process.env.OUT_DIR || '/tmp'
const status = execSync('npx supabase status -o env', { cwd: ROOT, env: { ...process.env, CI: '1' }, stdio: ['ignore', 'pipe', 'ignore'] }).toString()
const env = Object.fromEntries(status.split('\n').map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/)).filter(Boolean).map((m) => [m[1], m[2]]))
const API = env.API_URL, SECRET = env.SECRET_KEY, PUB = env.PUBLISHABLE_KEY, DB = env.DB_URL
if (!API?.includes('127.0.0.1') || !SECRET || !PUB) throw new Error('This script runs against the local stack only.')
const APP = 'http://127.0.0.1:5199/aen-bina-yon/'
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
const rest = async (path, { method = 'GET', body, token, prefer } = {}) => {
  const r = await fetch(`${API}/rest/v1/${path}`, { method, headers: { apikey: PUB, authorization: `Bearer ${token ?? PUB}`, ...J, ...(prefer ? { prefer } : {}) }, body: body ? JSON.stringify(body) : undefined })
  const text = await r.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* not json */ }
  return { status: r.status, json, text }
}
const login = async (email, password) => {
  const r = await fetch(`${API}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: PUB, ...J }, body: JSON.stringify({ email, password }) })
  return { status: r.status, ...(await r.json()) }
}
const userStatus = async (accessToken) => (await fetch(`${API}/auth/v1/user`, { headers: { apikey: PUB, authorization: `Bearer ${accessToken}` } })).status
const refresh = async (refreshToken) => (await fetch(`${API}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: { apikey: PUB, ...J }, body: JSON.stringify({ refresh_token: refreshToken }) })).status

const suffix = Date.now().toString(36)
const PASS = 'Test-12345678'
const NEW_PASS = 'Yeni-Sifre-98765'
const newUser = async (tag, name) => {
  const email = `${tag}-${suffix}@s11.local`
  const r = await fetch(`${API}/auth/v1/admin/users`, { method: 'POST', headers: secretHeaders, body: JSON.stringify({ email, password: PASS, email_confirm: true, user_metadata: { full_name: name } }) })
  const u = await r.json()
  if (!u.id) throw new Error('could not create user ' + JSON.stringify(u))
  return { id: u.id, email }
}

console.log('SETUP')
const admin = await newUser('admin', 'Yönetici Deneme')
const res = await newUser('res', 'Zeynep Aydın')
const res2 = await newUser('res2', 'Başka Sakin')
const gone = await newUser('gone', 'Pasif Kişi')
await fetch(`${API}/rest/v1/site_members`, { method: 'POST', headers: secretHeaders, body: JSON.stringify({ profile_id: admin.id, site_id: SITE, role: 'admin' }) })
const units = await (await fetch(`${API}/rest/v1/units?block_id=eq.${BLOCK_A}&select=id,door_no&order=door_no`, { headers: secretHeaders })).json()
const unit = (door) => units.find((u) => u.door_no === door).id
for (const [who, door] of [[res, '1'], [res2, '2'], [gone, '3']]) {
  await fetch(`${API}/rest/v1/unit_residents`, { method: 'POST', headers: secretHeaders, body: JSON.stringify({ unit_id: unit(door), profile_id: who.id, relation: 'owner', start_date: '2026-01-01' }) })
}
sql(`update public.profiles set phone = '0532 000 00 00', kvkk_consent_at = '2026-11-12T08:30:00Z', kvkk_consent_version = 'v1' where id = '${res.id}';
     update public.profiles set is_active = false where id = '${gone.id}';`)
console.log('  users: admin, resident (A·1, with KVKK date), another resident, a deactivated resident')

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
const toastSeen = (page, text) => page.getByText(text).first().waitFor({ timeout: 8000 }).then(() => true, () => false)
const profileRow = (id) => JSON.parse(sql(`select row_to_json(p) from (select full_name, phone, notify_prefs from public.profiles where id = '${id}') p`))

// ---------------------------------------------------------------------------
console.log('1. THE PAGE, AS A RESIDENT (desktop)')
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } })
const page = await ctx.newPage()
watch(page, 'resident')
await signIn(page, res)
await page.goto(`${APP}#/profil`)
await page.getByRole('heading', { level: 1, name: 'Profilim' }).waitFor()
await page.getByLabel(/Ad soyad/).waitFor()
check('the page opens (it is no longer a "coming soon" page)', (await page.getByText('yapım aşamasında').count()) === 0)
check('name is shown', (await page.getByLabel(/Ad soyad/).inputValue()) === 'Zeynep Aydın')
check('phone is shown', (await page.getByLabel('Telefon').inputValue()) === '0532 000 00 00')
const emailBox = page.getByLabel('E-posta')
check('e-mail is shown, read-only and disabled', (await emailBox.inputValue()) === res.email && (await emailBox.isDisabled()))
const bodyText = await page.locator('main').innerText()
check('the role and the unit are shown', bodyText.includes('Sakin') && bodyText.includes('A Blok · 1 · Kat Maliki'))
check('the KVKK date is shown in Istanbul time (12.11.2026 11:30)', bodyText.includes('12.11.2026 11:30'))
check('the e-mail choices say "only saved"', bodyText.includes('yalnızca kaydedilir'))
check('all three choices start ON', (await page.getByRole('checkbox').evaluateAll((els) => els.map((e) => e.getAttribute('aria-checked') === 'true' || e.checked))).every(Boolean))
check('the side menu has "Profil" and it is the active page', (await page.getByRole('navigation', { name: 'Ana menü' }).getByRole('link', { name: 'Profil' }).getAttribute('aria-current')) === 'page')
check('the page fits the screen', await noSideScroll(page))
await page.screenshot({ path: `${OUT}/s11-resident-desktop.png`, fullPage: true })

console.log('2. NAME AND PHONE')
const saveContact = page.getByRole('button', { name: 'Kaydet' }).nth(0)
check('"Kaydet" is off until something changes', await saveContact.isDisabled())
await page.getByLabel(/Ad soyad/).fill('A')
await page.getByLabel('Telefon').fill('abc')
await saveContact.click()
check('a one-letter name is refused with a message', await page.getByText('Ad soyad en az 2 karakter olmalı.').isVisible())
check('a wrong phone is refused with a message', await page.getByText(/Geçerli bir telefon numarası yazın/).isVisible())
check('nothing was saved', profileRow(res.id).full_name === 'Zeynep Aydın')
await page.getByLabel(/Ad soyad/).fill('  Defne Aydın  ')
await page.getByLabel('Telefon').fill('0533 111 22 33')
await saveContact.click()
check('the toast says it was saved', await toastSeen(page, 'Bilgileriniz kaydedildi.'))
let row = profileRow(res.id)
check('the database has the new name (trimmed) and phone', row.full_name === 'Defne Aydın' && row.phone === '0533 111 22 33', JSON.stringify(row))
await page.reload()
await page.getByLabel(/Ad soyad/).waitFor()
check('after a reload the new values are shown', (await page.getByLabel(/Ad soyad/).inputValue()) === 'Defne Aydın' && (await page.getByLabel('Telefon').inputValue()) === '0533 111 22 33')
await page.getByLabel('Telefon').fill('')
await page.getByRole('button', { name: 'Kaydet' }).nth(0).click()
await toastSeen(page, 'Bilgileriniz kaydedildi.')
check('an empty phone is saved as "no phone" (null)', profileRow(res.id).phone === null)
await page.goto(`${APP}#/panel`)
check('the greeting on the home page uses the new first name', await page.getByText('Merhaba, Defne').first().waitFor({ timeout: 8000 }).then(() => true, () => false))

console.log('3. E-MAIL CHOICES')
await page.goto(`${APP}#/profil`)
await page.getByLabel(/Ad soyad/).waitFor()
const finance = page.getByRole('checkbox', { name: /Borç ve ödemeler/ })
const savePrefs = page.getByRole('button', { name: 'Kaydet' }).nth(1)
check('"Kaydet" of the choices is off until something changes', await savePrefs.isDisabled())
await finance.click()
check('"Kaydet" turns on', await savePrefs.isEnabled())
await savePrefs.click()
check('the toast says the choices were saved', await toastSeen(page, 'Bildirim tercihleriniz kaydedildi.'))
const stored = profileRow(res.id).notify_prefs
check('the database has all three choices (finance off, the others on)', stored.email_finance === false && stored.email_announcements === true && stored.email_requests === true, JSON.stringify(stored))
await page.reload()
await page.getByLabel(/Ad soyad/).waitFor()
check('after a reload "Borç ve ödemeler" is off and the others are on', (await page.getByRole('checkbox', { name: /Borç ve ödemeler/ }).getAttribute('aria-checked')) === 'false' && (await page.getByRole('checkbox', { name: /Duyurular/ }).getAttribute('aria-checked')) === 'true' && (await page.getByRole('checkbox', { name: /Taleplerim/ }).getAttribute('aria-checked')) === 'true')

console.log('4. THE DATABASE REFUSES THE WRONG WAYS (with real tokens)')
const rTok = (await login(res.email, PASS)).access_token
const aTok = (await login(admin.email, PASS)).access_token
let r = await rest(`profiles?id=eq.${res.id}`, { method: 'PATCH', token: rTok, body: { notify_prefs: {} } })
check('a resident cannot write notify_prefs directly (HTTP ' + r.status + ')', r.status === 403 || r.status === 401, r.text.slice(0, 120))
r = await rest(`profiles?id=eq.${res.id}`, { method: 'PATCH', token: aTok, body: { notify_prefs: { email_finance: true } } })
check('an admin cannot write a resident\'s choices directly (HTTP ' + r.status + ')', r.status === 403 || r.status === 401, r.text.slice(0, 120))
check('...and the resident\'s choices did not move', profileRow(res.id).notify_prefs.email_finance === false)
r = await rest('rpc/save_my_notification_prefs', { method: 'POST', token: rTok, body: { p_prefs: { sms: true } } })
check('an unknown key is refused (prefs_invalid)', r.status === 400 && r.text.includes('prefs_invalid'), r.text.slice(0, 120))
r = await rest('rpc/save_my_notification_prefs', { method: 'POST', token: rTok, body: { p_prefs: { email_requests: 'yes' } } })
check('a text instead of true/false is refused', r.status === 400 && r.text.includes('prefs_invalid'), r.text.slice(0, 120))
r = await rest('rpc/save_my_notification_prefs', { method: 'POST', body: { p_prefs: { email_requests: true } } })
check('a visitor cannot call the function (HTTP ' + r.status + ')', r.status === 401 || r.status === 403, r.text.slice(0, 120))
r = await rest('rpc/save_my_notification_prefs', { method: 'POST', token: aTok, body: { p_prefs: { email_announcements: false } } })
check('an admin saving changes only their own row', r.status === 200 && profileRow(admin.id).notify_prefs.email_announcements === false && profileRow(res.id).notify_prefs.email_announcements === true, r.text.slice(0, 120))
r = await rest(`profiles?id=eq.${res2.id}`, { method: 'PATCH', token: rTok, body: { full_name: 'Hack' }, prefer: 'return=representation' })
check('a resident cannot change another resident\'s name (no row found)', r.status === 200 && Array.isArray(r.json) && r.json.length === 0 && profileRow(res2.id).full_name === 'Başka Sakin', r.text.slice(0, 120))
r = await rest(`profiles?id=eq.${res.id}`, { method: 'PATCH', token: aTok, body: { phone: '0544 555 66 77' }, prefer: 'return=representation' })
check('the admin can still correct a resident\'s phone (Sakinler keeps working)', r.status === 200 && r.json?.length === 1 && profileRow(res.id).phone === '0544 555 66 77', r.text.slice(0, 120))
const goneTok = (await login(gone.email, PASS)).access_token
r = await rest('rpc/save_my_notification_prefs', { method: 'POST', token: goneTok, body: { p_prefs: { email_finance: false } } })
check('a deactivated person gets "not allowed"', r.status === 403 && r.text.includes('not allowed'), r.status + ' ' + r.text.slice(0, 120))
check('...and nothing was written', JSON.stringify(profileRow(gone.id).notify_prefs) === '{}')

console.log('5. PASSWORD')
const sessionB = await login(res.email, PASS) // "another device"
check('another device is signed in before the change', (await userStatus(sessionB.access_token)) === 200)
const current = page.getByLabel(/Mevcut şifre/)
const newPw = page.getByLabel(/^Yeni şifre \*/)
const again = page.getByLabel(/Yeni şifre \(tekrar\)/)
const change = page.getByRole('button', { name: 'Şifreyi değiştir' })
await change.click()
check('an empty form shows the required messages', (await page.getByText('Mevcut şifrenizi yazın.').isVisible()) && (await page.getByText('Şifre en az 8 karakter olmalı.').isVisible()))
await current.fill(PASS); await newPw.fill(NEW_PASS); await again.fill('baska-bir-sifre-1')
await change.click()
check('a repeat that does not match is refused', await page.getByText('Şifreler aynı değil.').isVisible())
await again.fill(NEW_PASS); await current.fill('yanlis-sifre-123')
await change.click()
check('a wrong current password says "Mevcut şifre hatalı."', await page.getByText('Mevcut şifre hatalı.').waitFor({ timeout: 8000 }).then(() => true, () => false))
check('...and the password did not change', (await login(res.email, PASS)).status === 200)
check('...and this page is still the Profil page, signed in', page.url().includes('#/profil') && (await newPw.inputValue()) === NEW_PASS)
await current.fill(NEW_PASS)
await change.click()
check('the new password may not equal the old one', await page.getByText('Yeni şifre, mevcut şifrenizle aynı olamaz.').isVisible())
await current.fill(PASS)
await change.click()
check('the toast says the password changed and the other devices were closed', await toastSeen(page, 'Şifreniz değiştirildi. Diğer cihazlardaki oturumlar kapatıldı.'))
check('the form is cleared', (await current.inputValue()) === '' && (await newPw.inputValue()) === '')
check('this page did not redirect or reset: still the Profil page', page.url().includes('#/profil') && (await page.getByRole('heading', { level: 1, name: 'Profilim' }).isVisible()))
check('the OLD password no longer works', (await login(res.email, PASS)).status === 400)
const nowSession = await login(res.email, NEW_PASS)
check('the NEW password works', nowSession.status === 200)
check('the other device\'s access token is refused now (HTTP ' + (await userStatus(sessionB.access_token)) + ')', (await userStatus(sessionB.access_token)) !== 200)
check('the other device cannot refresh its session either', (await refresh(sessionB.refresh_token)) >= 400)
await page.reload()
await page.getByLabel(/Ad soyad/).waitFor({ timeout: 10000 })
check('this device is still signed in after a reload', page.url().includes('#/profil'))
await page.screenshot({ path: `${OUT}/s11-after-password.png`, fullPage: true })

console.log('6. CLOSE THE OTHER DEVICES ON REQUEST')
const sessionC = await login(res.email, NEW_PASS)
check('a third device is signed in', (await userStatus(sessionC.access_token)) === 200)
await page.getByRole('button', { name: 'Diğer cihazlardaki oturumları kapat' }).click()
check('the toast says the sessions were closed', await toastSeen(page, 'Diğer cihazlardaki oturumlar kapatıldı.'))
check('the third device is refused now', (await userStatus(sessionC.access_token)) !== 200)
await page.reload()
await page.getByLabel(/Ad soyad/).waitFor({ timeout: 10000 })
check('this device stays signed in', page.url().includes('#/profil'))
await ctx.close()

console.log('7. PHONE (390 px) - RESIDENT')
const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 } })
const phone = await phoneCtx.newPage()
watch(phone, 'phone')
await signIn(phone, res, NEW_PASS)
const profileButton = phone.getByRole('banner').getByRole('link', { name: 'Profilim' })
await profileButton.waitFor({ timeout: 8000 }).catch(() => {})
check('the header has a visible "Profilim" button on a phone', await profileButton.isVisible())
await profileButton.click()
await phone.getByRole('heading', { level: 1, name: 'Profilim' }).waitFor()
check('it opens the Profil page', phone.url().includes('#/profil'))
check('the page fits a phone (no sideways scroll)', await noSideScroll(phone))
await phone.screenshot({ path: `${OUT}/s11-resident-phone.png`, fullPage: true })
await phoneCtx.close()

console.log('8. THE ADMIN')
const aCtx = await browser.newContext({ viewport: { width: 1280, height: 1000 } })
const ap = await aCtx.newPage()
watch(ap, 'admin')
await signIn(ap, admin)
await ap.getByRole('navigation', { name: 'Ana menü' }).getByRole('link', { name: 'Profilim' }).click()
await ap.getByRole('heading', { level: 1, name: 'Profilim' }).waitFor()
check('the side menu opens /yonetim/profil', ap.url().includes('#/yonetim/profil'))
await ap.getByLabel(/Ad soyad/).waitFor()
const adminText = await ap.locator('main').innerText()
check('it shows "Yönetici" and the site, and no unit', adminText.includes('Yönetici') && adminText.includes('Demo Sitesi') && !adminText.includes('Dairenizdeki yeriniz'))
await ap.getByLabel(/Ad soyad/).fill('Yönetici Yeni Ad')
await ap.getByRole('button', { name: 'Kaydet' }).nth(0).click()
check('the admin saves their own name', (await toastSeen(ap, 'Bilgileriniz kaydedildi.')) && profileRow(admin.id).full_name === 'Yönetici Yeni Ad')
await ap.screenshot({ path: `${OUT}/s11-admin-desktop.png`, fullPage: true })
await aCtx.close()
const aPhoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 } })
const aPhone = await aPhoneCtx.newPage()
watch(aPhone, 'admin-phone')
await signIn(aPhone, admin)
const aButton = aPhone.getByRole('banner').getByRole('link', { name: 'Profilim' })
await aButton.waitFor({ timeout: 8000 }).catch(() => {})
check('the admin header has a visible "Profilim" button on a phone', await aButton.isVisible())
await aButton.click()
await aPhone.getByRole('heading', { level: 1, name: 'Profilim' }).waitFor()
check('the admin page fits a phone', await noSideScroll(aPhone))
await aPhone.screenshot({ path: `${OUT}/s11-admin-phone.png`, fullPage: true })
await aPhoneCtx.close()

console.log('9. NOBODY ELSE')
const visitorCtx = await browser.newContext()
const visitor = await visitorCtx.newPage()
await visitor.goto(`${APP}#/profil`)
check('a visitor is sent to the login page', await visitor.getByRole('heading', { level: 1, name: 'Giriş yap' }).waitFor({ timeout: 8000 }).then(() => true, () => false))
await visitorCtx.close()
const resCtx = await browser.newContext()
const resPage = await resCtx.newPage()
await signIn(resPage, res2)
await resPage.goto(`${APP}#/yonetim/profil`)
await resPage.waitForTimeout(1500)
check('a resident cannot open the admin profile address', !resPage.url().includes('#/yonetim/profil') || (await resPage.getByRole('heading', { level: 1, name: 'Profilim' }).count()) === 0)
await resCtx.close()

console.log('\nCONSOLE')
const allowed = (m) => /status of 4\d\d/.test(m) || /400 \(Bad Request\)/.test(m)
const unexpected = errors.filter((m) => !allowed(m))
check('no unexpected console or page error (only the 400s from wrong passwords)', unexpected.length === 0, '\n' + unexpected.join('\n'))
await browser.close()
console.log(`\n${ok} passed, ${fail} failed`)
if (fail) console.log('FAILED:\n - ' + failed.join('\n - '))
process.exit(fail ? 1 : 0)
