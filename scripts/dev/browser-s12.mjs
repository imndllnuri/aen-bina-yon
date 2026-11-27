// Real-browser check of slice 12 (legal pages, service pages, contact form, WhatsApp button, map link, admin messages)
// against the LOCAL stack.
//   npx supabase start ; npx supabase db reset ; scripts/dev/dev-local.sh   (dev server on port 5199)
//   OUT_DIR=/some/folder node scripts/dev/browser-s12.mjs
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
const suffix = Date.now().toString(36)
const PASS = 'Test-12345678'
const newUser = async (tag, name) => {
  const email = `${tag}-${suffix}@s12.local`
  const r = await fetch(`${API}/auth/v1/admin/users`, { method: 'POST', headers: secretHeaders, body: JSON.stringify({ email, password: PASS, email_confirm: true, user_metadata: { full_name: name } }) })
  const u = await r.json()
  if (!u.id) throw new Error('could not create user ' + JSON.stringify(u))
  return { id: u.id, email }
}
const count = (where) => Number(sql(`select count(*) from public.contact_messages where ${where}`))

console.log('SETUP')
const admin = await newUser('admin', 'Yönetici Deneme')
const res = await newUser('res', 'Zeynep Aydın')
await fetch(`${API}/rest/v1/site_members`, { method: 'POST', headers: secretHeaders, body: JSON.stringify({ profile_id: admin.id, site_id: SITE, role: 'admin' }) })
const units = await (await fetch(`${API}/rest/v1/units?block_id=eq.${BLOCK_A}&select=id,door_no&order=door_no`, { headers: secretHeaders })).json()
await fetch(`${API}/rest/v1/unit_residents`, { method: 'POST', headers: secretHeaders, body: JSON.stringify({ unit_id: units.find((u) => u.door_no === '1').id, profile_id: res.id, relation: 'owner', start_date: '2026-01-01' }) })
sql(`delete from public.contact_messages`)
console.log('  users: an admin and a resident; the message table is empty')

const browser = await chromium.launch()
const errors = []
const watch = (page, label) => {
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${label}: ${m.text()}`) })
  page.on('pageerror', (e) => errors.push(`${label} pageerror: ${e.message}`))
}
const signIn = async (page, who) => {
  await page.goto(`${APP}#/giris`)
  await page.getByLabel('E-posta').fill(who.email)
  await page.getByLabel('Şifre', { exact: true }).fill(PASS)
  await page.getByRole('button', { name: 'Giriş yap' }).click()
  await page.waitForURL(/#\/(panel|yonetim)/)
}
const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
const toastSeen = (page, text) => page.getByText(text).first().waitFor({ timeout: 8000 }).then(() => true, () => false)

// ---------------------------------------------------------------------------
console.log('1. THE LEGAL PAGES (a visitor, desktop)')
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await ctx.newPage()
watch(page, 'visitor')
await page.goto(`${APP}#/`)
await page.getByRole('navigation', { name: 'Yasal' }).waitFor()
const legalLinks = await page.getByRole('navigation', { name: 'Yasal' }).getByRole('link').allTextContents()
check('the footer has the five legal links', JSON.stringify(legalLinks) === JSON.stringify(['SSS', 'KVKK Aydınlatma Metni', 'Çerez Politikası', 'Mesafeli Satış Sözleşmesi', 'KMK Bilgi']), JSON.stringify(legalLinks))
for (const [label, title] of [['SSS', 'Sıkça Sorulan Sorular'], ['KVKK Aydınlatma Metni', 'KVKK Aydınlatma Metni'], ['Çerez Politikası', 'Çerez Politikası'], ['Mesafeli Satış Sözleşmesi', 'Mesafeli Satış Sözleşmesi'], ['KMK Bilgi', 'Kat Mülkiyeti Kanunu (KMK) hakkında kısa bilgi']]) {
  await page.getByRole('navigation', { name: 'Yasal' }).getByRole('link', { name: label }).click()
  await page.getByRole('heading', { level: 1, name: title }).waitFor({ timeout: 8000 })
  const note = await page.getByRole('note').first().innerText()
  check(`"${label}" opens from the footer and says it is a draft for a lawyer`, note.includes('taslaktır') && note.includes('hukukçu'))
}
await page.screenshot({ path: `${OUT}/s12-kmk.png`, fullPage: true })
await page.goto(`${APP}#/sss`)
const first = page.locator('details').first()
await first.waitFor()
check('the first FAQ answer is closed, and opens on a click', !(await first.evaluate((e) => e.open)) && (await first.locator('summary').click(), await first.evaluate((e) => e.open)))
check('the FAQ has at least 10 questions', (await page.locator('details').count()) >= 10)
await page.goto(`${APP}#/kvkk`)
check('the KVKK page shows its version', await page.getByText('Sürüm: 2026-11-taslak-3').isVisible())
await page.goto(`${APP}#/cerez-politikasi`)
check('the cookie page says the site sets no cookies', await page.getByText('çerez (cookie) kullanmaz').isVisible())
check('the pages fit the screen', await noSideScroll(page))

console.log('2. THE COOKIE CLAIM IS TRUE (real proof)')
const visited = ['#/', '#/hizmetler', '#/teklif-al', '#/iletisim', '#/sss', '#/kvkk', '#/giris']
for (const hash of visited) { await page.goto(`${APP}${hash}`); await page.waitForTimeout(150) }
check('after visiting every public page the browser holds NO cookie for this site', (await ctx.cookies()).length === 0, JSON.stringify(await ctx.cookies()))

console.log('3. SERVICE PAGES')
await page.goto(`${APP}#/hizmetler`)
const cards = page.getByRole('link', { name: /: ayrıntılar$/ })
await cards.first().waitFor()
check('the grid has six "Ayrıntılar" links', (await cards.count()) === 6)
await page.getByRole('link', { name: 'Aidat ve Tahsilat: ayrıntılar' }).click()
await page.getByRole('heading', { level: 1, name: 'Aidat ve Tahsilat' }).waitFor()
check('a service opens on its own address', page.url().endsWith('#/hizmetler/aidat-ve-tahsilat'))
check('it shows its text, "Neler dahil?" and five other services', (await page.getByRole('heading', { name: 'Neler dahil?' }).isVisible()) && (await page.getByRole('heading', { name: 'Diğer hizmetler' }).locator('xpath=following-sibling::ul[1]//a').count()) === 5)
await page.getByRole('link', { name: 'Teklif Al' }).first().click()
check('"Teklif Al" goes to the quote form', await page.getByRole('heading', { level: 1, name: 'Teklif Al' }).waitFor({ timeout: 8000 }).then(() => true, () => false))
await page.goto(`${APP}#/hizmetler/yok-boyle-bir-hizmet`)
check('an unknown service shows the 404 page', await page.getByRole('heading', { name: 'Sayfa bulunamadı' }).waitFor({ timeout: 8000 }).then(() => true, () => false))

console.log('4. THE CONTACT FORM')
await page.goto(`${APP}#/iletisim`)
await page.getByRole('form', { name: 'İletişim formu' }).waitFor()
const map = page.getByRole('link', { name: 'Haritada aç' })
const mapHref = await map.getAttribute('href')
check('"Haritada aç" is a link to a map search, in a new tab, safely', mapHref.startsWith('https://www.google.com/maps/search/?api=1&query=') && (await map.getAttribute('target')) === '_blank' && (await map.getAttribute('rel')).includes('noopener'), mapHref)
check('no map or other outside page is embedded (no iframe)', (await page.locator('iframe').count()) === 0)
await page.getByRole('button', { name: 'Mesajı gönder' }).click()
check('an empty form shows the required messages and sends nothing', (await page.getByText('Lütfen adınızı ve soyadınızı yazın.').isVisible()) && (await page.getByText('Lütfen mesajınızı yazın (en az 5 karakter).').isVisible()) && count('true') === 0)
await page.getByLabel(/Adınız soyadınız/).fill('Ahmet Yılmaz')
await page.getByLabel('Mesajınız', { exact: false }).fill('Merhaba, bilgi almak istiyorum.')
await page.getByRole('checkbox', { name: /KVKK Aydınlatma Metni/ }).click()
await page.getByRole('button', { name: 'Mesajı gönder' }).click()
check('without phone or e-mail it asks for one', await page.getByText('Telefon veya e-posta alanlarından en az birini doldurun.').isVisible())
await page.getByLabel('Telefon').fill('0532 000 00 00')
await page.getByRole('button', { name: 'Mesajı gönder' }).click()
check('a good message is sent and thanked', await page.getByRole('heading', { name: 'Mesajınız alındı' }).waitFor({ timeout: 8000 }).then(() => true, () => false))
check('the database has exactly that message, status "new", no note', count(`name = 'Ahmet Yılmaz' and phone = '0532 000 00 00' and email is null and status = 'new' and admin_note is null and message = 'Merhaba, bilgi almak istiyorum.'`) === 1)
await page.getByRole('button', { name: 'Yeni bir mesaj yaz' }).click()
check('"Yeni bir mesaj yaz" gives an empty form', (await page.getByLabel(/Adınız soyadınız/).inputValue()) === '')
// a message full of tags: must stay text everywhere
await page.getByLabel(/Adınız soyadınız/).fill('Deneme Kişi')
await page.getByLabel('E-posta').fill('deneme@ornek.com')
await page.getByLabel('Mesajınız', { exact: false }).fill('<img src=x onerror="window.__xss=1">\n=HYPERLINK("http://evil.example","tıkla")')
await page.getByRole('checkbox', { name: /KVKK Aydınlatma Metni/ }).click()
await page.getByRole('button', { name: 'Mesajı gönder' }).click()
await page.getByRole('heading', { name: 'Mesajınız alındı' }).waitFor({ timeout: 8000 })
check('a message with tags is saved as it was typed', count(`name = 'Deneme Kişi' and message like '<img src=x onerror=%'`) === 1)
// the honeypot: a bot fills the hidden field
await page.getByRole('button', { name: 'Yeni bir mesaj yaz' }).click()
await page.getByLabel(/Adınız soyadınız/).fill('Bot Kişi')
await page.getByLabel('Telefon').fill('0532 000 00 00')
await page.getByLabel('Mesajınız', { exact: false }).fill('Ucuz ilaç satıyoruz buyrun.')
await page.getByRole('checkbox', { name: /KVKK Aydınlatma Metni/ }).click()
await page.locator('#contact-website').fill('http://spam.example', { force: true }) // a bot types into the hidden field
await page.getByRole('button', { name: 'Mesajı gönder' }).click()
check('a bot is thanked but nothing is saved (honeypot)', (await page.getByRole('heading', { name: 'Mesajınız alındı' }).waitFor({ timeout: 8000 }).then(() => true, () => false)) && count(`name = 'Bot Kişi'`) === 0)
await page.screenshot({ path: `${OUT}/s12-contact.png`, fullPage: true })

console.log('5. THE DATABASE REFUSES THE WRONG WAYS (a visitor with the public key)')
let r = await rest('contact_messages?select=id')
check('a visitor cannot read the messages (HTTP ' + r.status + ')', r.status === 401 || r.status === 403, r.text.slice(0, 120))
r = await rest('contact_messages', { method: 'POST', body: { name: 'Hack Kişi', phone: '0532 000 00 00', message: 'Merhaba merhaba', status: 'answered' } })
check('a visitor cannot choose the status (HTTP ' + r.status + ')', r.status === 401 || r.status === 403, r.text.slice(0, 120))
r = await rest('contact_messages', { method: 'POST', body: { name: 'Hack Kişi', phone: '0532 000 00 00', message: 'Merhaba merhaba' }, prefer: 'return=representation' })
check('a visitor cannot ask for the row back (HTTP ' + r.status + ')', r.status === 401 || r.status === 403, r.text.slice(0, 120))
r = await rest('contact_messages?id=not.is.null', { method: 'DELETE' })
check('a visitor cannot delete (HTTP ' + r.status + ')', r.status === 401 || r.status === 403, r.text.slice(0, 120))
r = await rest('contact_messages?id=not.is.null', { method: 'PATCH', body: { status: 'read' } })
check('a visitor cannot change (HTTP ' + r.status + ')', r.status === 401 || r.status === 403, r.text.slice(0, 120))
check('none of those wrote or changed anything', count(`name = 'Hack Kişi'`) === 0 && count(`status <> 'new'`) === 0)

console.log('6. THE WHATSAPP BUTTON')
for (const hash of ['#/', '#/hizmetler', '#/iletisim', '#/sss']) {
  await page.goto(`${APP}${hash}`)
  const wa = page.getByRole('link', { name: 'WhatsApp ile yazın' }).last()
  await wa.waitFor()
  const box = await wa.boundingBox()
  const view = page.viewportSize()
  check(`on ${hash} the round button is at the bottom right, fully visible`, box && box.x + box.width <= view.width && box.y + box.height <= view.height && box.x > view.width - 120 && box.y > view.height - 120, JSON.stringify(box))
}
const wa = page.getByRole('link', { name: 'WhatsApp ile yazın' }).last()
check('it opens the company number in a new tab', (await wa.getAttribute('href')).startsWith('https://wa.me/') && (await wa.getAttribute('target')) === '_blank')
await page.goto(`${APP}#/kvkk`)
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
await page.waitForTimeout(200)
const legalNav = page.getByRole('navigation', { name: 'Yasal' }).getByRole('link', { name: 'KMK Bilgi' })
const lb = await legalNav.boundingBox()
const coveredBy = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('a')?.getAttribute('aria-label') ?? null, [lb.x + lb.width / 2, lb.y + lb.height / 2])
check('at the bottom of a page the round button does not cover the footer links', coveredBy !== 'WhatsApp ile yazın', String(coveredBy))
await ctx.close()

console.log('7. THE ADMIN READS THE MESSAGES')
const aCtx = await browser.newContext({ viewport: { width: 1280, height: 1000 } })
const ap = await aCtx.newPage()
watch(ap, 'admin')
await signIn(ap, admin)
await ap.getByRole('heading', { level: 1, name: 'Genel Bakış' }).waitFor()
check('the admin panel has no WhatsApp button', (await ap.getByRole('link', { name: 'WhatsApp ile yazın' }).count()) === 0)
await ap.getByRole('navigation', { name: 'Ana menü' }).getByRole('link', { name: 'İletişim Mesajları' }).click()
await ap.getByRole('heading', { level: 1, name: 'İletişim Mesajları' }).waitFor()
await ap.getByRole('list', { name: 'İletişim mesajları' }).waitFor()
check('the page lists the 2 saved messages, newest first (Deneme Kişi, then Ahmet Yılmaz)', JSON.stringify(await ap.getByRole('list', { name: 'İletişim mesajları' }).getByRole('listitem').locator('p.font-medium').allTextContents()) === JSON.stringify(['Deneme Kişi', 'Ahmet Yılmaz']))
const body = await ap.getByRole('list', { name: 'İletişim mesajları' }).innerText()
check('the tags of the message are shown as plain text (no script ran, no image tag)', body.includes('<img src=x') && (await ap.evaluate(() => window.__xss)) === undefined && (await ap.locator('main img[src="x"]').count()) === 0)
await ap.screenshot({ path: `${OUT}/s12-admin-messages.png`, fullPage: true })
await ap.getByRole('combobox', { name: 'Ahmet Yılmaz için durum' }).selectOption('read')
await ap.waitForTimeout(800)
check('changing the status saves it ("read")', count(`name = 'Ahmet Yılmaz' and status = 'read'`) === 1)
await ap.getByRole('button', { name: 'Mesajın tamamı ve not' }).nth(1).click()
const dialog = ap.getByRole('dialog')
await dialog.getByLabel(/Notunuz/).fill('Arandı, yarın dönecek.')
await dialog.getByRole('button', { name: 'Notu kaydet' }).click()
check('a note is saved', (await toastSeen(ap, 'Not kaydedildi.')) && count(`name = 'Ahmet Yılmaz' and admin_note = 'Arandı, yarın dönecek.'`) === 1)
check('what the visitor wrote did not change', count(`name = 'Ahmet Yılmaz' and message = 'Merhaba, bilgi almak istiyorum.' and phone = '0532 000 00 00'`) === 1)
await ap.getByLabel('Durum', { exact: true }).selectOption('read')
check('the filter shows only the messages with that status', (await ap.getByRole('list', { name: 'İletişim mesajları' }).getByRole('listitem').count()) === 1)
await ap.getByLabel('Durum', { exact: true }).selectOption('')
await ap.getByRole('button', { name: 'Deneme Kişi mesajını sil' }).click()
await ap.getByRole('dialog').getByRole('button', { name: 'Sil' }).click()
check('a message is deleted after a question', (await toastSeen(ap, 'Mesaj silindi.')) && count(`name = 'Deneme Kişi'`) === 0)
check('the admin can also reach the page by address and the menu marks it', (await ap.getByRole('navigation', { name: 'Ana menü' }).getByRole('link', { name: 'İletişim Mesajları' }).getAttribute('aria-current')) === 'page')
await aCtx.close()

console.log('8. NOBODY ELSE')
const rCtx = await browser.newContext()
const rp = await rCtx.newPage()
await signIn(rp, res)
await rp.goto(`${APP}#/yonetim/mesajlar`)
await rp.waitForTimeout(1500)
check('a resident cannot open the admin messages page', (await rp.getByRole('heading', { level: 1, name: 'İletişim Mesajları' }).count()) === 0)
const rToken = (await (await fetch(`${API}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: PUB, ...J }, body: JSON.stringify({ email: res.email, password: PASS }) })).json()).access_token
r = await rest('contact_messages?select=id', { token: rToken })
check('a resident reading through the API gets no rows', r.status === 200 && Array.isArray(r.json) && r.json.length === 0, r.text.slice(0, 120))
check('the public pages show no outside content to a logged-in resident either: still no cookie', (await rCtx.cookies()).length === 0)
await rCtx.close()

console.log('9. PHONE (390 px)')
const pCtx = await browser.newContext({ viewport: { width: 390, height: 844 } })
const pp = await pCtx.newPage()
watch(pp, 'phone')
for (const hash of ['#/iletisim', '#/sss', '#/mesafeli-satis', '#/hizmetler/guvenlik-ve-kvkk']) {
  await pp.goto(`${APP}${hash}`)
  await pp.waitForTimeout(400)
  check(`${hash} fits a phone (no sideways scroll)`, await noSideScroll(pp))
}
await pp.goto(`${APP}#/iletisim`)
await pp.getByRole('form', { name: 'İletişim formu' }).waitFor()
await pp.screenshot({ path: `${OUT}/s12-contact-phone.png`, fullPage: true })
const waBox = await pp.getByRole('link', { name: 'WhatsApp ile yazın' }).last().boundingBox()
check('the WhatsApp button is fully visible on a phone', waBox && waBox.x + waBox.width <= 390 && waBox.y + waBox.height <= 844)
await pCtx.close()

console.log('\nCONSOLE')
const allowed = (m) => /status of 4\d\d/.test(m)
const unexpected = errors.filter((m) => !allowed(m))
check('no unexpected console or page error', unexpected.length === 0, '\n' + unexpected.join('\n'))
await browser.close()
console.log(`\n${ok} passed, ${fail} failed`)
if (fail) console.log('FAILED:\n - ' + failed.join('\n - '))
process.exit(fail ? 1 : 0)
