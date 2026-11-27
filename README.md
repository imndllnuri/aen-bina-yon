# Site Yönetim Portalı (aen-bina-yon)

A building / site management portal: a public website, a resident panel (**Sakin Paneli**) and an
admin panel (**Yönetim Paneli**) in one React app. All UI text is Turkish.

- Live (GitHub Pages): https://imndllnuri.github.io/aen-bina-yon/
- Backend: Supabase (Postgres, Auth, Storage, Row Level Security) — **not connected yet**
- Plan: "Site Yönetim Portalı — Full Project Plan" (20 sections; build guide is section 15)

## Stack

React 19 · TypeScript · Vite · Tailwind CSS v4 · shadcn/ui (Radix) · Lucide icons ·
React Router (hash mode) · TanStack Query · React Hook Form + Zod · Supabase · Vitest.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173/aen-bina-yon/
```

Before every push:

```bash
npm run lint && npm run test && npm run build
npm run preview    # http://localhost:4173/aen-bina-yon/
```

The public site works without a backend. For login and data, copy `.env.example` to
`.env.local` and fill in the Supabase values.

## Database (Supabase)

The database is described by SQL files in `supabase/migrations/` (the database can be rebuilt from
Git). Supabase CLI **v3** is used through `npx supabase`. Note: in v3, `db push` and `gen types`
use the **local** database unless you add `--remote`.

| File | What |
|---|---|
| `supabase/migrations/0001_core.sql` | companies, sites, blocks, units, profiles, site_members, unit_residents, quote_requests, helper functions, RLS |
| `supabase/migrations/0002_residents.sql` | `accept_kvkk()`, `set_profile_active()`, guard against archiving occupied units, "end date = day moved out" |
| `supabase/migrations/0003_charges.sql` | charge types, monthly plans, charge batches, charges, the split function and the charge RPCs (see "Charges" below) |
| `supabase/migrations/0004_resident_charges.sql` | residents read their own charges: the visibility rule, `charge_status` and `unit_balances` views (see "Resident panel" below) |
| `supabase/migrations/0005_payments.sql` | payments, allocations, receipt numbers, the mock checkout functions, `get_receipt`, `void_payment`, real paid amounts in the views, guards for paid lines (see "Payments" below) |
| `supabase/migrations/0006_transfers.sql` | havale notices, the private `dekontlar` bucket, manual payments, the allocation engine, bank accounts, one visibility rule for "who may pay which line" (see "Havale notices and manual payments" below) |
| `supabase/migrations/0007_announcements.sql` | announcements (plain text), who-gets-it targets, recipients, read receipts, the bell (`notifications`) and the triggers that ring it (see "Announcements and the bell" below) |
| `supabase/migrations/0008_requests.sql` | requests, the timeline, comments (with internal notes), photos, the private `talep-fotolari` bucket and seven checked functions (see "Requests" below) |
| `supabase/migrations/0009_admin_tools.sql` | the audit log (`audit_log`, one trigger on twelve tables), dashboard and report functions, charge-type and settings functions, quote-request status (see "Dashboard, reports, settings and audit log" below) |
| `supabase/migrations/0010_profile.sql` | the Profil page: a shape check on `profiles.notify_prefs` and `save_my_notification_prefs()` (only the person changes their own e-mail choices; see "Profil page" below) |
| `supabase/migrations/0011_contact_messages.sql` | the public contact form: `contact_messages` (visitors insert four columns only; admins read, answer and delete; see "Public pages" below) |
| `supabase/migrations/0012_admins.sql` | managing admins: `site_members` can no longer be written from the browser; `list_site_admins`, `add_site_admin`, `remove_site_admin`; the audit log names the person of an admin change (see "Yöneticiler" below) |
| `supabase/functions/invite-resident/` | Edge Function: an admin invites a resident and gets a one-time link (see below) |
| `supabase/seed.sql` | Demo site: 2 blocks, 16 units (local `db reset` only) |
| `supabase/tests/database/` | pgTAP tests: who can see and change what (RLS) |
| `supabase/templates/` | Invite and password-reset e-mails (Turkish) |
| `supabase/config.toml` | Auth settings. **Production values**: signups off, Pages URL |

Work on a local copy (needs Docker, no login needed):

```bash
npx supabase start --exclude studio,logflare,vector,edge-runtime,imgproxy,mailpit,realtime,supavisor,postgres-meta
npx supabase db reset      # apply all migrations + seed.sql
npx supabase test db       # run the pgTAP tests
npm run test:functions     # call the real invite function with real logins (needs the stack running)
npx supabase stop
```

Send it to the hosted project (needs `npx supabase login` once, then `link`):

```bash
npx supabase link --project-ref <ref>
npx supabase config diff                     # READ this first: it shows what would change online
npx supabase db push --remote --dry-run      # then without --dry-run
npx supabase functions deploy invite-resident
npx supabase gen types --remote > src/lib/database.types.ts
```

Rules for new migrations: enable RLS in the same file, write explicit `grant` lines, put helper
functions in the `private` schema, and add a test.

`config.toml` only declares the settings this project manages (login URLs, signups off, minimum
password). Everything else is commented out on purpose: `config push` leaves undeclared settings
alone, but the generated local defaults would turn hosted MFA and e-mail protections **off**.

### Hosted project status

- Project `aen-bina-yonetimi` (ref `dogcevoorjlgbmykaqdy`, region eu-west-2). Signups are **off**
  (invite-only). Migrations `0001` to `0012` and the demo data are applied (the audit log starts empty on the day 0009 was applied), and the
  `invite-resident` function is deployed.
- The first admin is made by hand: create a user in the dashboard (Authentication → Users → Add
  user), then run this in the SQL Editor (demo site id from `seed.sql`):
  ```sql
  insert into public.site_members (profile_id, site_id, role)
  values ('<user-uuid>', '00000000-0000-0000-0000-000000000010', 'admin');
  ```

### Units, residents and invites (slice 3)

Admin pages: `/#/yonetim/daireler` (blocks, units, bulk generator "A Blok, 10 kat, katta 4 daire")
and `/#/yonetim/sakinler` (residents, invites, status, moved out, deactivate).

- **Invites without e-mail.** An admin adds a resident and the server function returns a one-time
  link to copy or send by WhatsApp. Reason: the free Supabase e-mail service only sends to your
  own organization members. When a custom SMTP service exists, the link can also be e-mailed.
- **Who may get a link.** The function runs with the secret key (it bypasses Row Level Security),
  so it checks everything itself (`supabase/functions/invite-resident/logic.ts`, 38 unit tests, and
  `npm run test:functions` with 33 checks against the real function). A link is only ever returned
  for a plain resident who has **not finished the invite page**. People who finished (or are admins,
  staff, deactivated, or yourself) never get one: a link is a way to sign in as that person.
- **"Davet bekliyor" / "Aktif".** The invite page records the KVKK consent as its last step
  (`accept_kvkk()`), so "consent recorded" means "invite page finished".
- **Residency dates.** `end_date` is the day the person **moved out**: from that day on they no
  longer live there. "Taşındı" with today's date therefore takes effect immediately.
- **Deactivated people** keep their history but see nothing. Open tabs notice this when the person
  comes back to the tab (the account is re-checked on focus).

### Charges: Borçlandırma (slice 4)

Admin page: `/#/yonetim/borclandirma` with three tabs: **Borçlar** (the lines, with filters, totals,
edit, cancel), **Toplu işlemler** (every bulk or single operation: undo, delete a fresh mistake) and
**Aylık planlar** ("Bu ayı oluştur"). Buttons: **Toplu borçlandır** (4-step wizard with a preview)
and **Tek borç ekle**.

- **The database does all the money maths.** The browser sends "how much" and "how to split";
  `private.split_charge()` splits it. The preview and the real creation call the **same** function,
  so what the admin sees is what is saved, to the kuruş. Amounts travel as whole kuruş (no floats).
- **Split methods:** `per_unit` (every unit pays the amount), `equal`, `land_share` (arsa payı) and
  `gross_m2` (the amount is a total to share). Rounding is largest remainder: 10.000 TL by arsa payı
  over 16 units leaves 8 kuruş, which go to the 8 units with the biggest remainder, so the lines
  always add up to the total. Ties go in block / door order (2 before 10).
- **Nobody writes charges directly.** `charges`, `charge_batches` and `recurring_plans` have no insert
  or delete grant. Admins call functions that check who is calling: `preview_charge_batch`,
  `create_charge_batch`, `void_charge`, `void_charge_batch`, `delete_charge_batch` (only in the first
  15 minutes), `save_recurring_plan`, `set_recurring_plan_active`, `generate_recurring_batch`.
  Only amount, due date, description and tenant visibility can be edited, and a cancelled line is frozen.
- **No double charge.** Each confirm screen sends a request id; the same id returns the same batch.
  The id changes when anything in the request changes. "Bu ayı oluştur" twice for the same plan and
  month is refused (unique index). "This month" is the Istanbul month.
- **Aidat increase rule (KMK m. 37).** Editing a plan so that the amount **per unit** rises by more than
  the YDO (default 25,49 %, `companies.settings.ydo_rate`) needs a kurul karar number and date. Exactly at
  the limit is allowed. Changing the split method cannot get around it.
- **Not yet (on purpose):** residents cannot see charges (slice 5, with owner / tenant rules), payments
  and "Ödendi / Kısmi" status (slice 6), notifications (slice 8), audit log (slice 10), **automatic late
  fees** (they need payment data; `Gecikme Tazminatı` exists only as a charge type). When payments
  arrive, slice 6 must also stop amount edits, voiding and archiving for lines that have payments
  (marked in the SQL comments).

### Resident panel (slice 5)

Resident pages: `/#/panel` (Ana Sayfa: total debt, overdue part, next due date, next 3 charges) and
`/#/borclarim` (tabs Ödenmemiş / Gelecek / Ödenmiş / Tümü, and the **Ekstre** statement with
opening balance, running balance and closing balance; "Yazdır / PDF" uses the browser print dialog).

- **The visibility rule lives in one place:** `private.resident_sees_charge()` (migration 0004).
  A resident sees lines only for a **current** residency of an **active** account (`end_date` is the
  day they moved out). Cancelled lines are hidden.
  - An **owner** sees every line of the unit.
  - A **tenant** sees only lines marked "kiracıya yansıt" **and** whose due date is on or after the
    tenant's own start date. So a new tenant never sees the previous tenant's lines.
  - Someone who moved out, or has not moved in yet, sees nothing.
- **Consequence for admins:** the start date ("Taşınma tarihi") must be the real move-in date. If an
  existing tenant is entered with today's date, their older lines stay hidden. The date can be
  corrected later in Sakinler -> Bilgileri düzenle.
- **The browser never decides visibility.** Lists, the balance and the running balance all come from
  the database (`charge_status`, `unit_balances` are `security_invoker` views, so RLS applies). The
  `tenant_visible` flag is not even in the view: residents are never shown it.
- **Sign-out clears the data cache** and resident cache keys contain the person's id, so two people on one
  computer (or an owner and a tenant of one unit) never see each other's cached data.
- **Not yet (honest "coming soon" states, no dead buttons):** online payment ("Hemen Öde"), "Ödenmiş"
  lines and "Son ödemeler" (slice 6), announcements (slice 8), requests (slice 9). Slice 6 must replace
  the two views (`paid_amount` is 0 now) and extend the guards listed in `0003_charges.sql`.

### Payments and receipts (slice 6)

Resident pages: **Borçlarım** (tick lines, "Seçilenleri Öde"), `/#/odeme` (summary from the database,
installments, agreement), `/#/odeme/3d` (a FAKE bank screen with "Onayla" and "Başarısız Simüle Et"),
`/#/odeme/sonuc` (receipt number, "Makbuzu İndir (PDF)") and **Ödemelerim**. Admin page:
**Tahsilatlar** (all payments, receipts, cancel a payment with a reason).

- **The database computes every amount.** `quote_payment()` returns the lines, the fee and the total;
  `pay_charges_mock()` is given the total the person saw and refuses (`quote_outdated`) if anything changed.
  It locks the lines, then re-checks: the caller must be a current, active resident who may SEE every line
  (the visibility rule of slice 5, so a tenant who guesses the id of a hidden line is refused), lines must be
  in one unit, not cancelled and not already paid. Admins cannot use it.
- **No double payment.** A request id per checkout returns the same payment for a double click or a retry.
- **Receipts.** Numbers look like `MKB-2026-000123` (a sequence, Istanbul year, never reused, even after a
  cancel). `get_receipt()` reads a stored snapshot (payer name, unit label) after an access check. The PDF is
  built in the browser (the library and the Noto Sans font are loaded only when somebody asks for a PDF),
  and a TEST notice is printed on every mock receipt. Check: `pdftotext` and `pdffonts` on a downloaded receipt.
- **A paid line is part of the books.** Its amount and due date cannot change, it cannot be cancelled, and its
  operation cannot be undone or deleted. An admin cancels the PAYMENT first (Tahsilatlar): the receipt stays,
  marked "İPTAL EDİLDİ", and the lines are unpaid again.
- **Who sees payments.** Admins of the site; the payer; the owners of the unit. A tenant never sees what the
  owner paid, but sees the line as paid (paid amounts come from a helper, residents never read allocations).
- **Fee.** 0 by default ("yönetim öder"). The database supports `{"payment": {"commission_payer": "resident",
  "fee_pct": {"3": 2.5}}}` in `companies.settings` (the Ayarlar page will edit it). Allocations add up to the
  amount WITHOUT the fee.
- **SAFETY SWITCH: the mock only works for companies with `{"payment_mode": "mock"}` in their settings**
  (the demo company has it). A resident can mark their own debt "paid" with the mock without any money moving,
  so **before real residents and real money exist, switch it off:**
  `update public.companies set settings = settings - 'payment_mode';` and add the real provider (iyzico).
- **Not yet:** refunds, overpayment credit (alacak), pending / failed payment statuses, late fees (all need
  the real provider), notifications (slice 8). Mock payments on the hosted project are permanent unless an
  admin cancels them in Tahsilatlar. (Manual entry, havale notices and partial payments: slice 7, below.)

### Havale notices and manual payments (slice 7)

The two offline channels of the plan. Resident page **Havale Bildir** (`/#/havale-bildirimi`): the IBAN cards
with a copy button, a form (amount, date on the slip, name on the slip, note, the dekont file) and the list of
the person's notices with their state. Admin pages: **Havale Onayları** (the queue, the dekont next to the
facts, approve / reject, and the bank accounts residents see) and, in **Tahsilatlar**, **"Elle ödeme gir"**
(cash, office card machine, or a bank transfer typed in by hand).

- **A notice is not a payment.** The resident sends a notice; nothing is paid until an admin approves it.
  Approve makes the payment, its allocations and the receipt in ONE transaction (`approve_transfer_notice`).
  Reject needs a reason (3 to 300 characters) that the resident reads. A resident can withdraw a waiting
  notice. Nobody writes `transfer_notices` directly: only `submit_ / cancel_ / approve_ / reject_transfer_notice`.
- **The dekont is private.** Bucket `dekontlar`: private, 5 MB, PDF / JPG / PNG only, one folder per unit
  (`<unit id>/<uuid>.<pdf|jpg|png>`). A resident can upload only into the folder of a unit they live in today;
  the uploader and the admins of the site can read; nobody can change or delete from the browser. `submit_`
  checks that the file exists, was uploaded by the same person and sits in the notice's unit folder, and that one
  file belongs to one notice. The admin opens the file through a 5 minute signed link. The browser also checks
  the first bytes of the file ("magic bytes"), so a program called `dekont.pdf` is refused before the upload.
- **How money is spread (the allocation rule).** Oldest due date first, in integer kuruş; the last line may be
  paid in part ("Kısmi"). The admin may pick the lines instead; the money then goes over the picked lines in the
  same order. The preview (`preview_allocation`) and the real payment use the same function.
- **A payer may only close lines the payer can SEE.** The visibility rule of slice 5 now lives in
  `private.profile_sees_charge(person, ...)` and `resident_sees_charge` just asks it for the logged-in user. So
  a tenant's havale is never spread over an owner-only line (e.g. Demirbaş), and the tenant's receipt never lists
  one. With "somebody else" as payer (no profile), every line of the unit may be closed.
- **No overpayment.** An amount bigger than what is open is refused (`amount_exceeds_debt`): there is no credit
  (alacak) yet. The admin rejects such a notice with a reason. Refunds are not built either.
- **Dates.** `paid_at` is the MONEY date (the date on the slip, or the day the cash arrived; noon Istanbul time
  for an earlier day, the real time for today). The receipt number takes its year from the day it is ISSUED.
  `payments.created_at` says when it was typed in. `payments.note` is printed on the receipt.
- **Bank accounts** live in `companies.settings.bank_accounts` (at most 5; the IBAN is checked with the
  ISO 7064 rule and stored without spaces) and are saved only by `save_bank_accounts`. **`companies.settings` can
  no longer be written from the browser at all** (it holds the payment safety switch).
- **These two channels do not need `payment_mode`.** They record money that really arrived. Only the fake card
  checkout needs the safety switch.
- **A cancelled havale payment:** the notice stays "approved" in the database, and the screens show "Ödeme
  iptal edildi" (the lines are unpaid again).
- **Idempotent.** A request id per form visit: a double click or a retry returns the same notice / payment.
- **Left for slice 8 (notifications):** "new notice" for admins, "approved / rejected" for the resident. Until
  then the resident reads the state and the reject reason on Havale Bildir and Ödemelerim. Left for slice 10:
  the audit log entries, a settings screen for bank accounts, deleting old files of rejected notices.

### Announcements and the bell (slice 8)

Resident pages: **Duyurular** (`/#/duyurular`: current and archive tabs, type chips, unread in bold with a dot, open = read),
**Bildirimler** (`/#/bildirimler`: the bell feed with "mark all read" and delete) and a **bell** in the header of every page (admin
too: `/#/yonetim/bildirimler`), with the unread number. The home page shows the latest announcements. Admin page: **Duyurular**
(`/#/yonetim/duyurular`): write, schedule, publish, take back, delete, read report, "Okumayanlara tekrar gönder".

- **Who gets an announcement = a scope and an audience.** Scope: whole site, some blocks, some units, or named persons. Audience:
  everybody, owners only, tenants only, or "borçlular". Only current, active residents are picked (not people who moved out,
  not deactivated accounts). The admin sees the recipient count BEFORE publishing (the preview and publish use one resolver,
  `private.audience`).
- **"Borçlu" means the person sees an open line.** The visibility rule of slice 5 decides, so a tenant is never picked because
  of an owner-only line.
- **The recipients are fixed when it is published** (`announcement_recipients`). The same rows decide who may read it, who is
  notified and who is in the read report, so the counts always match. Publishing again only adds people who joined the target
  meanwhile; nobody is notified twice.
- **A resident reads only what was sent to them,** once it is published and started, and only while they still live on the
  site. Residents can never read the target (it can list other people), the author, the counters or the recipient list: column
  grants, no policy at all on the recipients table. Nobody writes announcements, reads or notifications from the browser.
- **Plain text only.** No rich text, so nothing is ever read as HTML and no address becomes a link by itself.
- **Scheduling.** A start time in the future: the announcement and its notifications exist at once, but residents see them only
  from that time (`visible_at`); no scheduler is needed. After the end time it moves to the resident's archive.
- **Notifications are written only by the database.** Triggers: a new charge (the people who may see the line), a payment (the
  payer and the owners; a tenant is never told about an owner's payment), a cancelled payment ("payment received" stays, a "payment
  cancelled" is added), a new havale notice (the admins of that site), havale approved or rejected (the sender, one notification).
  Unread notifications that stop being true are removed: a cancelled charge, a deleted charge batch, a finished havale notice,
  an unpublished or deleted announcement.
- **A notification can never make money fail.** Texts are cut to length, links are fixed internal paths (the table refuses
  anything else, and the browser checks again before it navigates), duplicates are ignored, and every write is wrapped: an error
  is only a WARNING in the log. A test makes every notification insert fail on purpose and checks that a charge and a payment
  still work.
- **No backfill.** The charges and payments that existed before this migration created no notifications.
- **Not built (named on purpose):** rich text, attachments, templates, e-mail / SMS / push, reminders ("3 days left", "overdue":
  they need a scheduler), Realtime (the bell asks again every minute and when the window gets focus), notification preferences
  (Profilim), cleaning up old notifications. (Request events were added in slice 9.)

### Requests: Talepler (slice 9)

Resident pages: **Taleplerim** (`/#/taleplerim`: "Devam edenler" and "Tamamlananlar"), **Yeni talep** (`/#/taleplerim/yeni`: category,
title, text, priority, place, up to 3 photos) and one page per request (`/#/taleplerim/<id>`: the five steps with the history, the
comment thread, edit and cancel while "Açık", a 1-5 rating after "Çözüldü"). The home page has a "Taleplerim" card with "Arıza bildir".
Admin page: **Talepler** (`/#/yonetim/talepler`: list or board, filters, an "is it late?" badge, "Telefonla talep aç") and one page per
request (`/#/yonetim/talepler/<id>`: status, category and priority, comments and **internal notes**, the history with names).

- **Who sees a request:** the person it belongs to (`requester_id`) while they still live in the unit, and the admins of the site.
  Other people of the same unit do **not** see it ("Taleplerim" = my requests). An admin can open a request for a resident (a phone
  call): then `created_by` is the admin and `requester_id` is the resident, who is told about it.
- **Nobody writes the tables from the browser.** Seven checked functions: `create_request`, `update_request`, `cancel_request`
  (resident), `set_request_status`, `set_request_triage` (admin), `add_request_comment` (both), `rate_request` (resident). Each one
  checks the caller inside and answers with a short code that the app turns into Turkish.
- **The steps:** Açık → İnceleniyor → İşlemde → Çözüldü → Kapandı (`iptal` is a side road: only the resident cancels, only while
  "Açık"). An admin can move to any step; moving a solved request back to an open step is a "reopen" (the time of the solution and the
  rating belong to the old solution and are cleared). The **timeline is written by a trigger**, so it can never differ from the real
  status.
- **Internal notes stay inside** (`request_comments.is_internal`): the read policy hides them from the requester, a resident cannot ask
  for one (refused), an internal note never creates a notification, and the browser never asks for them in the resident view. Each of
  these four ways is tested, and has a deliberate-break test.
- **Photos** go into the private bucket `talep-fotolari` (`<unit id>/<uuid>.jpg|png|webp`, 5 MB, no delete or update policy). The
  browser **shrinks every photo to at most 1600 px and re-draws it as a JPEG**, which also removes the hidden place data (GPS in the
  EXIF block) a phone writes into a photo. If a picture cannot be re-drawn it is **not** sent. The database checks that each path exists
  in the bucket, was uploaded by the caller, is in the folder of that unit, and is not used by another request. Photos open through
  5-minute signed links; a resident can read a photo that an admin uploaded for them (the read policy goes through the request).
- **Notifications** (written only by triggers, never able to make a request fail): a new request -> the admins (not the one who typed
  it); a status change or a public answer of an admin -> the person the request belongs to; a comment of the resident -> the admins. One
  notification per EVENT (the timeline row or the comment), so a second status change is never swallowed by the first. A cancelled
  request, or one that somebody handled, removes the admins' unread "new request".
- **Limits:** 10 open requests per unit, 3 photos, title 3-120, text 3-2000, comment 2000 characters. Plain text everywhere.
- **"Late" badge:** computed in the browser from the age and the priority (urgent 1 day, high 3, normal 7, low 14). It is a default,
  not a promise; real SLA settings come with the Ayarlar screen (slice 10).
- **Not built (named on purpose):** assignee (needs the Görevli role of Faz 2), merging duplicates, request numbers, adding photos or
  comments with photos after the request exists, e-mail / SMS, cleaning up photos of cancelled requests, editing the category list
  (slice 10), a counter on the admin dashboard (slice 10). Photos can show people and the inside of a home: the KVKK text must cover them
  and say how long they are kept.

### Dashboard, reports, settings and audit log (slice 10)

Admin pages: **Genel Bakış** (`/#/yonetim`), **Raporlar** (`/#/yonetim/raporlar`), **Ayarlar** (`/#/yonetim/ayarlar`),
**İşlem Geçmişi** (`/#/yonetim/islem-gecmisi`) and **Teklif Talepleri** (`/#/yonetim/teklif-talepleri`).

- **Numbers come from the database, not from the browser.** Ten checked functions (`dashboard_kpis`, `report_monthly`, `report_debts`,
  `report_collections`, `report_collections_summary`, `report_residents`, `report_attendance`, `save_charge_type`, `delete_charge_type`,
  `save_company_settings`). Each one checks inside that the caller administers that site (or that company).
- **What the words mean** (also written on the screens):
  - *Tahakkuk* = lines that are not cancelled, in the month of their period (the month of the due date if there is no period).
  - *Tahsilat* = cash of **approved** payments, in the Istanbul month of the payment (the card fee is not counted).
  - *Oran* = what is paid so far of this month's lines ÷ this month's tahakkuk (empty when nothing was accrued).
  - *Aging* works on what is **left** of each line today: not due yet, 1-30, 31-60, 61-90, 90+ days late.
  - *Hazirun cetveli* = one row per unit, co-owners on one row, land share counted once, units without an owner are listed.
- **Excel files** are written in the browser by a small writer of our own (no extra library). Money is a real number with the ₺ look,
  dates are real dates, and text that looks like a formula (`=...`) stays text. "PDF" means the browser print dialog ("Yazdır / PDF").
  The files carry names, phones and e-mails: treat them as personal data.
- **Audit log** (`audit_log`): one trigger writes a row for every insert, update and delete on twelve tables (charges, batches, plans,
  charge types, payments, transfer notices, units, residents, announcements, requests, site members, companies). An update stores only
  the columns that changed. The trigger **fails closed**: if the log row cannot be written, the change is refused. Nobody can change or
  delete log rows, even the table owner (a trigger refuses). Site admins read their site's rows; company admins read company rows.
  There is **no clean-up job**: decide how long the log is kept (KVKK) before real residents join. Rows start from the day 0009 is applied.
- **Settings:** *in use now* = the YDO rate (warning on aidat increases), who pays the card fee and the fee percentages (they change
  what a resident pays at once), the due day (pre-filled in charge forms). *Saved only* = late-fee rate, method and grace days (there is
  no automatic late fee yet). The six default charge types can be switched off but never deleted; your own types can be deleted only
  if nothing uses them. The `payment_mode` safety switch is **not** changeable from the screen.
- **Not built (named on purpose):** admin invites, editing request categories, message templates, logo upload, automatic late fees,
  deleting old dekont and photo files, an allowed list for installments.

### Profil page (slice 11)

Pages: **Profil** for residents (`/#/profil`) and **Profilim** for admins (`/#/yonetim/profil`). On a phone both panels have a user button in the
header (the resident bottom bar has no room for it).

- **Kişisel bilgiler:** name and phone (the same rules as the admin's "Bilgileri düzenle" in Sakinler). The e-mail is the login address and is
  **read-only**: changing it needs a confirmation e-mail, which needs your own mail server (a later slice).
- **E-posta bildirimleri:** three choices (borç ve ödemeler, duyurular, taleplerim). They are **only stored for now**: nothing sends e-mail yet, and
  the page says so. A choice that was never made counts as ON. The bell inside the site is always on.
  - The choices are written by one checked function, `save_my_notification_prefs()`. The old column update was taken away: before 0010 a site admin
    could change a resident's choices through the API.
  - The database also checks the shape: only the three known keys, each `true` or `false`.
- **Şifre:** the person types the **current** password (checked by logging in with it), then the new one. After a change, the sessions on all
  **other** devices are closed. There is also a button to close them on request. A wrong current password says "Mevcut şifre hatalı."
  - For extra protection you can switch on "Secure password change" in the Supabase Auth settings (a hosted setting, not in this repo).
- **Hesabım:** role, the unit(s) or the sites, and the date the KVKK notice was accepted.
- **Not built (named on purpose):** changing the e-mail, deleting the account, a profile audit (the audit log does not list `profiles`), a photo.

### Helper scripts

| Path | What |
|---|---|
| `scripts/ops/fingerprint.py` | Compares the database **structure** of the local stack and the live project (12 categories, read-only on both sides) |
| `scripts/ops/live-check.py` | Safe checks of the live site and database as a **visitor** (public key only, nothing is written) |
| `scripts/dev/dev-local.sh` | Starts the dev server on port 5199 against the **local** stack |
| `scripts/dev/browser-s11.mjs` | Real-browser check of the Profil page against the local stack (keys are read from the local stack at run time) |
| `scripts/dev/break-db.py`, `break-ui.py` | The "break it on purpose" engines; the lists are in `scripts/dev/breaks/` |

### Public pages and the contact form (slice 12)

- **Legal and information pages** (footer links): **SSS** (`/#/sss`), **Çerez Politikası** (`/#/cerez-politikasi`), **Mesafeli Satış Sözleşmesi**
  (`/#/mesafeli-satis`), **KMK bilgi** (`/#/kat-mulkiyeti-kanunu`) and the **KVKK** text (`/#/kvkk`, now version `2026-11-taslak-3`).
  **All of them are DRAFTS** and say so on the page: a lawyer must review them before real residents join. Open facts are left as
  `[BRACKETS]` (tax number, retention period, delivery time).
  - The cookie text is true today: the site sets **no cookie at all**. It keeps the login and two small choices in the browser's own storage
    (checked in a real browser: zero cookies after visiting every public page).
  - The KMK page is a plain summary with a link to the official text on mevzuat.gov.tr. It is information, not legal advice.
  - When a legal text changes, change `KVKK_VERSION` (`src/config/kvkk.ts`): the version is stored with each person's consent.
- **Service pages:** every card of the Hizmetler grid opens `/#/hizmetler/<slug>` (the text lives in `src/features/public/services-data.ts`).
- **Contact form** (İletişim page) -> table `contact_messages` (migration 0011). Same safety model as the "Teklif Al" form: a visitor can only
  **insert** four columns (name, phone, e-mail, message), cannot read anything back, and cannot set the status. A hidden "honeypot" field catches
  simple bots. There is **no rate limit and no captcha yet**: expect some spam when the site is public.
- **İletişim Mesajları** (`/#/yonetim/mesajlar`, admin): list, status (Yeni / Okundu / Yanıtlandı), a private note, delete. The text of the
  visitor is shown as plain text and cannot be changed. Like the quote requests, every admin of every company sees the messages.
- **WhatsApp button:** a round button at the bottom right of every public page (not in the panels, hidden on paper). It uses `site.whatsapp`
  in `src/config/site.ts`, which is still a **placeholder number**: replace it with the real one.
- **Map link:** "Haritada aç" on the İletişim page is a plain link that searches the address. No map is embedded, so nothing is loaded from a
  map service until a person clicks.
- **Not built (named on purpose):** captcha or rate limit for the public forms, e-mail to the management when a message arrives (comes with the
  e-mail slice), replying from inside the portal.

### Yöneticiler: managing the admins (slice 13)

Page: **Yöneticiler** (`/#/yonetim/yoneticiler`, menu group Kişiler). It lists the admins of the selected site (name, e-mail, phone, since when,
and a status: **Etkin**, **Davet bekliyor** = invited but the invite page is not finished, or **Hesap devre dışı**). You can invite a new admin,
get a fresh link for a pending one, or take the admin role away.

- **A security gap was closed:** since slice 1 any admin could add, change or delete any `site_members` row through the API, including their
  own and the last admin's. Migration 0012 takes those rights away. Three checked functions replace them: `list_site_admins`,
  `add_site_admin`, `remove_site_admin`.
- **The rules are in the database, not in the screen:**
  - only an **active admin of that site** can call them;
  - you **cannot remove yourself**. Only an active admin can call the function, so at least one admin always stays;
  - a person can become admin only if they already belong to **this company** (a resident or a member of one of its sites) or are a brand-new
    account with no link anywhere (what the invite creates). Every other case gets the same answer, so nobody can probe which accounts exist;
  - a deactivated person cannot become admin; the site row is locked while a change runs (two admins cannot remove each other at once).
- **Inviting** goes through the Edge Function `invite-resident` (new actions `invite-admin` and `admin-link`). It creates the account with the
  secret key, then calls `add_site_admin` **with the caller's own token**, so the audit log names the admin who invited, not "nobody". The new
  admin gets a one-time link, like a resident (copy it or send it by WhatsApp: there is no e-mail yet). A link is given only for an admin of that
  site who has not finished the invite page; an admin who already finished resets the password by e-mail.
  **Deploy the function after changing it:** `npx supabase functions deploy invite-resident`.
- **Audit log:** an admin change is logged with the caller's name **and the name of the person** who was added or removed (a small trigger on
  `audit_log` writes `person` into those rows), for example "Yönetici Bir · Silindi · Yönetici: Berk Admin".
- **Fixing things by hand:** the SQL Editor (the `postgres` role) can still change `site_members` directly, for example to rescue a site that
  has lost its admin. The rules above apply to people who are logged in to the portal.
- **Not built (named on purpose):** roles other than admin (Görevli, Denetçi: Faz 2), switching off a person's whole account from this page
  (do it in Sakinler for residents), changing an admin's e-mail.

### Testing havale notices on the hosted demo

Use the sample IBAN `TR33 0006 1005 1978 6457 8413 26` (Havale Onayları → "Hesapları düzenle") and a **made-up**
PDF or PNG, never a real bank slip: dekonts are personal financial data, GitHub Pages is a demo host, and files
of rejected or cancelled notices are not deleted yet. Put the tenant and the owner on the same unit, send a notice
as the tenant, approve it as the admin, then check the receipt (PDF), the resident pages and "Elle ödeme gir".
Before real residents join, the KVKK text must cover dekont uploads and how long they are kept.

### Testing requests on the hosted demo

Use **made-up photos** (a plant, a wall), never your real home or people: photos are private, but GitHub Pages is a demo host, and
the photos of cancelled requests are not deleted yet. Put the tenant and the owner on the same unit, open a request as the tenant
with up to 3 photos, then work through it as the admin: change the status, write a public answer and an **internal note** (the tenant
must never see the note and must get no notification for it), solve it, rate it as the tenant, reopen it. On an iPhone, check that a
photo taken upright is accepted and comes out upright. Before real residents join, the KVKK text must cover request photos and how
long they are kept.

### Testing the resident panel with your own account

An invite is a one-time link (nothing is e-mailed). Use an address that is **not** the admin's, for
example a "+" alias of your own mailbox. Open the link in a private window or another browser, so the
admin session is not replaced. Set the move-in date to today or earlier. The best test is two accounts
on one unit: an owner and a tenant. Then add a "Demirbaş" charge to that unit: the owner sees it, the
tenant does not.

### Login, invites and password reset

Pages: `/#/giris` (login, "Beni hatırla"), `/#/sifremi-unuttum`, `/#/sifre-yenile` (reset),
`/#/auth/onay` (accept an invite). Closed signups: accounts only come from invites.

**How the e-mail links work.** Supabase links end in `<site>/#access_token=...&type=invite`. Our
router also uses the hash, so `main.tsx` first runs `handleAuthRedirect()`
(`src/lib/auth-redirect.ts`): it reads the tokens, removes them from the address bar **before
anything else**, saves the session, then opens the right page. `supabase-js` is told not to read
the URL itself (`detectSessionInUrl: false`). The router is created only after that
(`createAppRouter()` in `src/app/router.tsx`).

**Free plan limits (important).** The built-in Supabase e-mail service only sends to the e-mail
addresses of the members of your Supabase organization (other addresses fail with
`email_address_not_authorized`) and sends at most 2 e-mails per hour. Custom templates are refused
too, so `supabase/templates/*.html` are **not pushed**. **Before real residents are invited, set up
custom SMTP** (Authentication → SMTP settings). Then un-comment the two template blocks in
`config.toml`, run `config diff`, and `config push`.

**Testing links without sending e-mail** (local stack): create a link with the admin API, then open
it in a browser. Always pass `redirect_to`, otherwise Supabase uses the production site URL:

```bash
curl -s -X POST http://127.0.0.1:54321/auth/v1/admin/generate_link \
  -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"type":"invite","email":"x@test.local","redirect_to":"http://localhost:5173/aen-bina-yon/"}'
```

Only `http://localhost:5173/**` and the Pages URL are allowed as redirect addresses.

## Where things are

| Path | What |
|---|---|
| `src/config/site.ts` | **All placeholders** (firma adı, telefon, IBAN, adres). Edit this first. |
| `src/app/routes.tsx` | The route table (public, resident, admin) |
| `src/app/layouts/` | Public, Resident and Admin layouts |
| `src/features/` | One folder per area (`public`, `auth`, later `resident`, `admin`) |
| `src/lib/` | `supabase.ts`, `auth.ts`, `auth-guard.tsx`, `format.ts` (TRY money, GG.AA.YYYY dates) |
| `src/components/ui/` | shadcn/ui components (generated code, edit freely) |
| `src/index.css` | Theme tokens: "Derin Teal + Sıcak Amber", light and dark |
| `.github/workflows/deploy.yml` | Lint, test, build, deploy to Pages on every push to `main` |

## Notes

- `vite.config.ts` has `base: '/aen-bina-yon/'` (the repo name). Use `'/'` with a custom domain.
- Never put a `service_role` key in a `VITE_` variable. Those end up in the public bundle.
- GitHub Pages is a **demo** host. Do not enter real resident data here. A "Demo" badge is shown
  in every header (`demo: true` in `src/config/site.ts`).
