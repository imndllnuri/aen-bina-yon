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
| `supabase/seed.sql` | Demo site: 2 blocks, 16 units (local `db reset` only) |
| `supabase/tests/database/` | pgTAP tests: who can see and change what (RLS) |
| `supabase/templates/` | Invite and password-reset e-mails (Turkish) |
| `supabase/config.toml` | Auth settings. **Production values**: signups off, Pages URL |

Work on a local copy (needs Docker, no login needed):

```bash
npx supabase start --exclude studio,logflare,vector,edge-runtime,imgproxy,mailpit,realtime,supavisor,postgres-meta
npx supabase db reset      # apply all migrations + seed.sql
npx supabase test db       # run the pgTAP tests
npx supabase stop
```

Send it to the hosted project (needs `npx supabase login` once, then `link`):

```bash
npx supabase link --project-ref <ref>
npx supabase config diff                     # READ this first: it shows what would change online
npx supabase db push --remote --dry-run      # then without --dry-run
npx supabase gen types --remote > src/lib/database.types.ts
```

Rules for new migrations: enable RLS in the same file, write explicit `grant` lines, put helper
functions in the `private` schema, and add a test.

`config.toml` only declares the settings this project manages (login URLs, signups off, minimum
password). Everything else is commented out on purpose: `config push` leaves undeclared settings
alone, but the generated local defaults would turn hosted MFA and e-mail protections **off**.

### Hosted project status

- Project `aen-bina-yonetimi` (ref `dogcevoorjlgbmykaqdy`, region eu-west-2). Signups are **off**
  (invite-only). Migration `0001` and the demo data are applied.
- The first admin is made by hand: create a user in the dashboard (Authentication → Users → Add
  user), then run this in the SQL Editor (demo site id from `seed.sql`):
  ```sql
  insert into public.site_members (profile_id, site_id, role)
  values ('<user-uuid>', '00000000-0000-0000-0000-000000000010', 'admin');
  ```

### Auth e-mails (free plan)

Supabase refuses custom e-mail templates on the free plan while the built-in e-mail provider is
used, and the built-in provider is limited to 2 e-mails per hour. So `supabase/templates/*.html` are
**not pushed yet**. The Supabase default links put the session tokens in the URL hash
(`#access_token=...`), which collides with hash routes (`/#/...`). The login slice must read those
tokens before the router starts. When a custom SMTP provider is added, un-comment the two template
blocks in `config.toml`, run `config diff`, then `config push`.

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
