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
  (invite-only). Migrations `0001`, `0002` and `0003` and the demo data are applied, and the
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
