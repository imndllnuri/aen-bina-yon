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
