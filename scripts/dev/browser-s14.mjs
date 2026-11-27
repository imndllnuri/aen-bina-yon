// Real-browser check of slice 14 (Gecikme Tazminatı: preview, untick, approve, "numbers changed", undo, warnings, resident view)
// against the LOCAL stack.   npx supabase start ; npx supabase db reset ; scripts/dev/dev-local.sh (PORT=5173 or 5199)
//   OUT_DIR=/some/folder APP_URL=http://localhost:5173/aen-bina-yon/ node scripts/dev/browser-s14.mjs
// Keys are read from the local stack at run time. Never run this against the live project.
import { execSync } from 'node:child_process'
import { chromium } from 'playwright'

const ROOT = new URL('../..', import.meta.url).pathname
const OUT = process.env.OUT_DIR || '/tmp'
const status = execSync('npx supabase status -o env', { cwd: ROOT, env: { ...process.env, CI: '1' }, stdio: ['ignore', 'pipe', 'ignore'] }).toString()
const env = Object.fromEntries(status.split('\n').map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/)).filter(Boolean).map((m) => [m[1], m[2]]))
const API = env.API_URL, SECRET = env.SECRET_KEY, PUB = env.PUBLISHABLE_KEY, DB = env.DB_URL
if (!API?.includes('127.0.0.1') || !SECRET || !PUB) throw new Error('This script runs against the local stack only.')
const APP = process.env.APP_URL || 'http://localhost:5199/aen-bina-yon/'
const SITE = '00000000-0000-0000-0000-000000000010'
const COMPANY = '00000000-0000-0000-0000-000000000001'

let ok = 0, fail = 0
const failed = []
const check = (name, cond, detail = '') => {
  if (cond) { ok++; console.log('  ok  ', name) } else { fail++; failed.push(name); console.log('  FAIL', name, detail) }
}
const sql = (q) => execSync(`psql "${DB}" -v ON_ERROR_STOP=1 -tA`, { input: q }).toString().trim()
const J = { 'content-type': 'application/json' }
const secretHeaders = { apikey: SECRET, authorization: `Bearer ${SECRET}`, ...J }
const suffix = Date.now().toString(36)
const PASS = 'Test-12345678'
const newUser = async (tag, name) => {
  const email = `${tag}-${suffix}@s14.local`
  const r = await fetch(`${API}/auth/v1/admin/users`, { method: 'POST', headers: secretHeaders, body: JSON.stringify({ email, password: PASS, email_confirm: true, user_metadata: { full_name: name } }) })
  const u = await r.json()
  if (!u.id) throw new Error('could not create user ' + JSON.stringify(u))
  return { id: u.id, email }
}
const TODAY = `(now() at time zone 'Europe/Istanbul')::date`
const unitId = (block, door) => `(select u.id from public.units u join public.blocks b on b.id = u.block_id where b.site_id = '${SITE}' and b.name = '${block}' and u.door_no = '${door}')`
const typeId = (code) => `(select id from public.charge_types where company_id = '${COMPANY}' and code = '${code}')`
const feeCount = () => Number(sql(`select count(*) from public.charges where late_fee_source_id is not null`))
const feeSum = () => sql(`select coalesce(sum(amount), 0)::numeric(12,2) from public.charges where late_fee_source_id is not null`)
const setRules = (json) => sql(`update public.companies set settings = (settings - 'rules') || '{"rules": ${json}}'::jsonb where id = '${COMPANY}'`)
const clearRules = () => sql(`update public.companies set settings = settings - 'rules' where id = '${COMPANY}'`)

console.log('SETUP')
const a1 = await newUser('a1', 'Yönetici Bir')
const res = await newUser('res', 'Zeynep Sakin')
sql(`insert into public.site_members (profile_id, site_id, role) values ('${a1.id}', '${SITE}', 'admin');
     insert into public.unit_residents (unit_id, profile_id, relation, start_date) values (${unitId('A Blok', '1')}, '${res.id}', 'owner', ${TODAY} - 400);
     update public.profiles set kvkk_consent_at = now(), kvkk_consent_version = 'test' where id in ('${a1.id}', '${res.id}');
     insert into public.charge_batches (id, site_id, charge_type_id, target, split_method, amount, unit_count, total, due_date, tenant_visible)
       values ('d1400000-0000-0000-0000-000000000001', '${SITE}', ${typeId('aidat')}, '{"scope":"site"}', 'per_unit', 1, 1, 1, ${TODAY}, true);
     insert into public.charges (id, unit_id, charge_type_id, batch_id, amount, due_date, tenant_visible, period) values
       ('e1400000-0000-0000-0000-000000000001', ${unitId('A Blok', '1')}, ${typeId('aidat')}, 'd1400000-0000-0000-0000-000000000001', 1000, ${TODAY} - 40, true,  date_trunc('month', ${TODAY} - 40)::date),
       ('e1400000-0000-0000-0000-000000000002', ${unitId('A Blok', '2')}, ${typeId('aidat')}, 'd1400000-0000-0000-0000-000000000001',  500, ${TODAY} - 10, false, date_trunc('month', ${TODAY} - 10)::date),
       ('e1400000-0000-0000-0000-000000000003', ${unitId('A Blok', '3')}, ${typeId('aidat')}, 'd1400000-0000-0000-0000-000000000001',  600, ${TODAY} - 30, true,  date_trunc('month', ${TODAY} - 30)::date),
       ('e1400000-0000-0000-0000-000000000004', ${unitId('A Blok', '4')}, ${typeId('devir')}, 'd1400000-0000-0000-0000-000000000001',  700, ${TODAY} - 100, true, null);
     insert into public.payments (id, unit_id, unit_label, amount, method, provider, receipt_no, paid_at)
       values ('91400000-0000-0000-0000-000000000001', ${unitId('A Blok', '3')}, 'A Blok 3', 200, 'cash', 'manual', 'MKB-2026-914001', ((${TODAY} - 10) + time '12:00') at time zone 'Europe/Istanbul');
     insert into public.payment_allocations (payment_id, charge_id, amount) values ('91400000-0000-0000-0000-000000000001', 'e1400000-0000-0000-0000-000000000003', 200);`)
console.log('  data: A-1 Aidat 1000 (40 days late), A-2 Aidat 500 (10 days, owner-only), A-3 Aidat 600 (30 days, 200 paid 10 days ago), A-4 Devir 700 (100 days)')

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
const rowsOf = (page) => page.locator('section[aria-label="Yazılacak tazminatlar"] tbody tr')
const footerText = async (page) => (await page.locator('section[aria-label="Yazılacak tazminatlar"] tfoot').innerText()).replace(/\s+/g, ' ').trim()
const waitRows = async (page, n) => { for (let i = 0; i < 40; i++) { if ((await rowsOf(page).count()) === n) return true; await page.waitForTimeout(250) } return false }

console.log('1. THE LIST')
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1100 } })
const page = await ctx.newPage()
watch(page, 'admin')
await signIn(page, a1)
await page.getByRole('heading', { level: 1, name: 'Genel Bakış' }).waitFor()
await page.getByRole('navigation', { name: 'Ana menü' }).getByRole('link', { name: 'Gecikme Tazminatı' }).click()
await page.getByRole('heading', { level: 1, name: 'Gecikme Tazminatı' }).waitFor()
await rowsOf(page).first().waitFor()
check('the menu (Finans) opens /yonetim/gecikme-tazminati', page.url().endsWith('#/yonetim/gecikme-tazminati'))
const rules = page.getByRole('region', { name: 'Hesap kuralları' })
const rulesText = (await rules.innerText()).replace(/\s+/g, ' ')
check('the rules are shown: %5 / ay, daily, 0 days, and today', rulesText.includes('%5 / ay') && rulesText.includes('Günlük') && rulesText.includes('0 gün') && /\d\d\.\d\d\.\d{4}/.test(rulesText), rulesText)
check('three debts are listed (the old carried debt, Devir, is not)', await waitRows(page, 3))
const t1 = await rowsOf(page).allInnerTexts()
check('A-1 shows 40 days and 66,67; A-2 shows 10 days, 8,33 and "owner only"; A-3 shows 30 days and 26,67',
  /A Blok · 1[\s\S]*40 gün[\s\S]*66,67/.test(t1[0]) && /A Blok · 2[\s\S]*Yalnızca malike görünür[\s\S]*10 gün[\s\S]*8,33/.test(t1[1]) && /A Blok · 3[\s\S]*30 gün[\s\S]*26,67/.test(t1[2]), JSON.stringify(t1))
check('A-3 shows what is still unpaid (400,00)', /400,00/.test(t1[2]))
check('all three are ticked, 101,67 in all', (await footerText(page)).includes('Seçili: 3 satır') && (await footerText(page)).includes('101,67'), await footerText(page))
check('no warning for 5 % daily', (await page.getByRole('note').count()) === 0)
check('nothing is written by only looking', feeCount() === 0)
await page.screenshot({ path: `${OUT}/s14-list.png`, fullPage: true })

console.log('2. UNTICK AND SAY NO')
await page.getByRole('checkbox', { name: /A Blok · 2 .* için tazminat yaz/ }).click()
check('unticking A-2 gives "2 of 3" and 93,34', (await footerText(page)).includes('Seçili: 2 satır (toplam 3)') && (await footerText(page)).includes('93,34'), await footerText(page))
await page.getByRole('button', { name: 'Onayla ve yaz' }).click()
let dialog = page.getByRole('dialog')
check('the window says 2 lines, 93,34, the 15 minutes, and what cancelling means', await dialog.getByText(/2 borç satırı için toplam .*93,34 gecikme tazminatı yazılacak/).isVisible() && await dialog.getByText(/15 dakika içinde/).isVisible() && await dialog.getByText(/affetmek demektir/).isVisible())
await dialog.getByRole('button', { name: 'Vazgeç' }).click()
check('"Vazgeç" writes nothing', feeCount() === 0)

console.log('3. THE NUMBERS CHANGE BEHIND THE SCREEN')
await page.getByRole('button', { name: 'Onayla ve yaz' }).click()
dialog = page.getByRole('dialog')
await dialog.waitFor()
// somebody records a payment of 400 for A-3, dated 5 days ago: its fee drops from 26,67 to 23,33
sql(`insert into public.payments (id, unit_id, unit_label, amount, method, provider, receipt_no, paid_at)
       values ('91400000-0000-0000-0000-000000000002', ${unitId('A Blok', '3')}, 'A Blok 3', 400, 'cash', 'manual', 'MKB-2026-914002', ((${TODAY} - 5) + time '12:00') at time zone 'Europe/Istanbul');
     insert into public.payment_allocations (payment_id, charge_id, amount) values ('91400000-0000-0000-0000-000000000002', 'e1400000-0000-0000-0000-000000000003', 400);`)
await dialog.getByRole('button', { name: 'Evet, yaz' }).click()
await dialog.getByText(/rakamlar değişti/).waitFor({ timeout: 10000 })
check('the window says "the numbers changed, nothing was written" and stays open', await dialog.getByText(/Hiçbir şey yazılmadı/).isVisible() && feeCount() === 0)
await dialog.getByRole('button', { name: 'Vazgeç' }).click()
check('behind it the list is read again: A-3 is now 23,33 and the total 90,00', await (async () => { for (let i = 0; i < 40; i++) { const f = await footerText(page); if (f.includes('90,00')) return true; await page.waitForTimeout(250) } return false })(), await footerText(page))

console.log('4. APPROVE')
await page.getByRole('button', { name: 'Onayla ve yaz' }).click()
dialog = page.getByRole('dialog')
check('the window now says 2 lines and 90,00', await dialog.getByText(/2 borç satırı için toplam .*90,00/).isVisible())
await dialog.getByRole('button', { name: 'Evet, yaz' }).click()
await page.getByText(/2 borç satırı için .*90,00 gecikme tazminatı yazıldı/).first().waitFor({ timeout: 10000 })
check('the success message appears and the window closes', await page.getByRole('dialog').count() === 0)
check('the database has 2 fee lines, 90,00 together', feeCount() === 2 && feeSum() === '90.00', feeSum())
check('one batch of the kind late_fee, 90,00, 2 lines, today', sql(`select count(*) from public.charge_batches where split_method = 'late_fee' and total = 90.00 and unit_count = 2 and due_date = ${TODAY}`) === '1')
check('the fee line of A-1 is 66,67, points at its debt and copies its due date', sql(`select (f.amount = 66.67 and f.late_fee_source_id = c.id and f.due_date = c.due_date and f.late_fee_through = ${TODAY}) from public.charges f join public.charges c on c.id = f.late_fee_source_id where c.id = 'e1400000-0000-0000-0000-000000000001'`) === 't')
check('only A-2 is left in the list', await waitRows(page, 1) && /A Blok · 2/.test((await rowsOf(page).allInnerTexts())[0]))
await page.reload()
check('after a reload it is still only A-2 (the same fee is never offered twice)', await waitRows(page, 1))

console.log('5. THE REST, THEN NOTHING LEFT')
await page.getByRole('button', { name: 'Onayla ve yaz' }).click()
await page.getByRole('dialog').getByRole('button', { name: 'Evet, yaz' }).click()
await page.getByText(/1 borç satırı için .*8,33 gecikme tazminatı yazıldı/).first().waitFor({ timeout: 10000 })
check('the third fee is written (8,33), 98,33 in all', feeCount() === 3 && feeSum() === '98.33', feeSum())
await page.getByText(/Şu anda yazılacak gecikme tazminatı yok/).waitFor({ timeout: 10000 })
check('the list says there is nothing left, and there is no approve button', await page.getByRole('button', { name: 'Onayla ve yaz' }).count() === 0)

console.log('6. UNDO (Borçlandırma > Toplu işlemler > Sil)')
await page.getByRole('navigation', { name: 'Ana menü' }).getByRole('link', { name: 'Borçlandırma' }).click()
await page.getByRole('tab', { name: 'Toplu işlemler' }).click()
const batchRows = page.locator('tbody tr').filter({ hasText: 'Gecikme hesabı' })
await batchRows.first().waitFor({ timeout: 10000 })
check('the batch list shows both fee runs with the label "Gecikme hesabı"', (await batchRows.count()) === 2)
const newest = batchRows.first()
check('the newest run is the one-line run of 8,33', /8,33/.test(await newest.innerText()), await newest.innerText())
await newest.getByRole('button', { name: /işlemler/ }).click()
await page.getByRole('menuitem', { name: /Sil \(ilk 15 dakika\)/ }).click()
await page.getByRole('dialog').getByRole('button', { name: 'Sil', exact: true }).click()
await page.getByText('İşlem silindi.').first().waitFor({ timeout: 10000 }).catch(() => {})
check('deleting the run leaves nothing behind: 2 fee lines (90,00) remain', await (async () => { for (let i = 0; i < 40; i++) { if (feeCount() === 2) return feeSum() === '90.00'; await page.waitForTimeout(250) } return false })(), `${feeCount()} ${feeSum()}`)
await page.getByRole('navigation', { name: 'Ana menü' }).getByRole('link', { name: 'Gecikme Tazminatı' }).click()
check('the late-fee list offers A-2 (8,33) again', await waitRows(page, 1) && /8,33/.test((await rowsOf(page).allInnerTexts())[0]))

console.log('7. A RESIDENT SEES THE FEE ON THEIR DEBT LIST')
const rctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } })
const rp = await rctx.newPage()
watch(rp, 'resident')
await signIn(rp, res)
await rp.goto(`${APP}#/borclarim`)
await rp.getByRole('heading', { level: 1, name: 'Borçlarım' }).waitFor()
await rp.getByText(/Gecikme tazminatı · Aidat/).first().waitFor({ timeout: 10000 })
const debtsText = (await rp.locator('main').innerText()).replace(/\s+/g, ' ')
check('the owner of A-1 sees the fee line with its description and 66,67', /Gecikme tazminatı · Aidat/.test(debtsText) && /66,67/.test(debtsText), debtsText.slice(0, 300))
check('the owner got a bell message about the fee, without an old "son ödeme" date', sql(`select count(*) from public.notifications where profile_id = '${res.id}' and kind = 'charge' and body like 'Gecikme tazminatı%' and body not like '%son ödeme%'`) === '1')
await rp.screenshot({ path: `${OUT}/s14-resident.png` })
await rp.goto(`${APP}#/yonetim/gecikme-tazminati`)
await rp.waitForTimeout(1500)
check('a resident cannot open the Gecikme Tazminatı page', !(await rp.getByRole('heading', { level: 1, name: 'Gecikme Tazminatı' }).count()) && !rp.url().includes('gecikme-tazminati'), rp.url())
await rctx.close()

console.log('8. THE RULES ARE READ FROM THE SETTINGS')
await page.goto(`${APP}#/yonetim/ayarlar`)
await page.getByText(/sayfasındaki hesapta kullanılır/).waitFor({ timeout: 10000 })
check('the Ayarlar page says where the late-fee values are used, with a link, and what a change does', await page.getByRole('link', { name: 'Gecikme Tazminatı', exact: true }).first().isVisible() && await page.getByText(/tüm gecikme süresi için yeni değerlerle yeniden yapılır/).isVisible())
setRules('{"late_fee_rate": 2, "late_fee_method": "daily", "grace_days": 0}')
await page.goto(`${APP}#/yonetim/gecikme-tazminati`)
const over = page.getByRole('region', { name: 'Fazla yazılmış tazminatlar' })
await over.waitFor({ timeout: 10000 })
const overText = (await over.innerText()).replace(/\s+/g, ' ')
check('at 2 % the fees already written are shown as too high: A-1 (26,67 right, 66,67 written, 40,00 too much) and A-3 (9,33 / 23,33 / 14,00)', /A Blok · 1.*26,67.*66,67.*40,00/.test(overText) && /A Blok · 3.*9,33.*23,33.*14,00/.test(overText), overText)
check('...and nothing was taken back', feeCount() === 2 && feeSum() === '90.00')
check('...and A-2 is offered at the new rate (3,33)', await waitRows(page, 1) && /3,33/.test((await rowsOf(page).allInnerTexts())[0]))
setRules('{"late_fee_rate": 7.5, "late_fee_method": "monthly", "grace_days": 0}')
await page.reload()
await rowsOf(page).first().waitFor({ timeout: 10000 })
const notes = await page.getByRole('note').allInnerTexts()
check('7,5 % with "every started month": two warnings (rate above the law, whole month for one day)', notes.length === 2 && /%7,5/.test(notes[0]) && /ilk günü bile tam ay/.test(notes[1]), JSON.stringify(notes))
check('...and a line shows months: A-1 "2 ay (40 gün)"', /2 ay \(40 gün\)/.test((await rowsOf(page).allInnerTexts()).join(' ')))
await page.screenshot({ path: `${OUT}/s14-warnings.png`, fullPage: true })
clearRules()

console.log('9. PHONE (390 px)')
const pctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
const pp = await pctx.newPage()
watch(pp, 'phone')
await signIn(pp, a1)
await pp.goto(`${APP}#/yonetim/gecikme-tazminati`)
await rowsOf(pp).first().waitFor({ timeout: 10000 })
check('the page fits a phone (the table scrolls inside its own box)', await noSideScroll(pp))
await pp.getByRole('button', { name: 'Onayla ve yaz' }).click()
check('the approve window fits a phone', await noSideScroll(pp))
await pp.screenshot({ path: `${OUT}/s14-phone.png` })
await pctx.close()

console.log('\nCONSOLE')
const allowed = (m) => /status of 4\d\d/.test(m)
const unexpected = errors.filter((m) => !allowed(m))
check('no unexpected console or page error', unexpected.length === 0, '\n' + unexpected.join('\n'))
await browser.close()
console.log(`\n${ok} passed, ${fail} failed`)
if (fail) console.log('FAILED:\n - ' + failed.join('\n - '))
process.exit(fail ? 1 : 0)
