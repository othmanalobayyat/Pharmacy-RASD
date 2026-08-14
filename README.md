# Pharmacy RASD

Inventory tracker for a mobile clinic's pharmacy: medications with FEFO
(first-expired-first-out) batch tracking, a first-aid supplies section with
low-stock thresholds, a withdrawal log, and an admin/staff role system. The
UI is in Arabic (RTL).

Data is shared across the whole clinic team in real time — two staff on two
different devices see the same inventory, and one device's withdrawal shows
up on the other's screen automatically, without a manual refresh.

## Architecture

```
React (Vite SPA)
      ↓
Supabase Auth        — real accounts (email/password), session persisted in the browser
      ↓
Supabase / PostgreSQL — single source of truth for all pharmacy data
      ↓
Row Level Security    — every table scoped to the caller's clinic + role, enforced in the database
      ↓
Realtime              — postgres_changes events push live updates to every connected client
```

There is no custom backend server — the browser talks to Supabase directly.
All database access is centralized in `src/lib/pharmacyApi.js` and
`src/lib/auth.js`; no component queries Supabase directly. Stock-changing
operations (withdrawals, first-aid +/-1) go through Postgres RPC functions
rather than plain table updates, so the concurrency-sensitive math (FEFO
batch selection + decrement, "can't go negative") happens atomically in the
database, not in client state.

## Tech stack

| Layer | Technology |
|---|---|
| UI | React 19, Vite 8 |
| Icons | lucide-react |
| Backend | Supabase (Auth, PostgreSQL, RLS, Realtime) |
| Data access | `@supabase/supabase-js` |
| Linting | oxlint |
| Testing | Vitest |
| DB tooling | Supabase CLI (`supabase` devDependency, run via `npx`) |

No Express/Node backend, no Redux/Zustand, no GraphQL, no Docker — the app
is intentionally a plain static SPA plus Supabase.

## Requirements

- Node.js 20+
- A Supabase project (free tier is enough)
- (Optional, only if you need to apply/change migrations) the Supabase CLI —
  already available via `npx supabase ...`, no separate global install needed

## Installation

```bash
npm install
```

## Environment variables

Copy `.env.example` to `.env` and fill in your project's values (Supabase
dashboard → Project Settings → API):

```
VITE_SUPABASE_URL=       # Project URL, e.g. https://xxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=  # anon / publishable key — safe for the browser, protected by RLS
```

Do not put real values in `.env.example` — it stays as placeholders only.
`.env` is git-ignored and must never be committed.

**Never** put the `service_role` key anywhere in this repo, in `.env`, or in
any file under `src/` — anything prefixed `VITE_` is bundled straight into
the browser build and becomes public. The service-role key belongs only in
server-side/dashboard contexts, never in frontend code.

## Supabase setup

See [`supabase/README.md`](supabase/README.md) for the full, detailed guide.
Summary:

- **Migrations** (`supabase/migrations/0001`–`0006`) create the schema, RLS
  policies, RPC functions, the signup trigger, and Realtime config. Apply
  them with the Supabase CLI (`npx supabase link` + `npx supabase db push`)
  — never by pasting SQL into the dashboard, so the schema stays
  reproducible and version-controlled.
- **Auth**: email/password only. The first person to ever sign up becomes
  the clinic's `admin`; everyone after starts as `staff`.
- **RLS**: every table is scoped to `clinic_id` and, for writes, to role —
  enforced in Postgres, not just hidden in the UI. See
  `supabase/migrations/0002_rls_policies.sql`.
- **Realtime**: `categories`, `medications`, `batches`, `first_aid_items`,
  `withdrawal_logs` are in the `supabase_realtime` publication. Realtime
  must also be enabled at the project level (Database → Replication).
- **SMTP (signup confirmation emails)**: this project uses Supabase Auth's
  custom SMTP (e.g. Resend) for confirmation emails. That's configured
  entirely in the Supabase dashboard (Project Settings → Auth → SMTP
  Settings) — the SMTP/Resend API key is **never** stored in this repo, in
  `.env`, or in any frontend code.

## Roles — currently a test configuration

The admin/staff split exists and is enforced by RLS (not finalized business
rules): **admin** can add/edit/delete medications, categories, batches, and
first-aid items, manage UI labels, and change other users' roles; **staff**
can view everything, withdraw stock, and adjust first-aid quantities, but
not perform administrative changes. This is the current/test permission
set — the business owner has not yet finalized exactly what staff should be
allowed to do, so treat this split as configurable, not final. Changing it
means adding a **new** RLS migration (e.g. `0007_...`), never editing
`0002_rls_policies.sql` in place once it's applied to a real project.

## Development

```bash
npm run dev
```

## Testing

```bash
npm run test
```

Runs Vitest against `src/lib/*.test.js` — FEFO batch-selection logic, the
withdrawal/first-aid RPC call layer (mocked), and the legacy-data migration
mapping logic.

## Build

```bash
npm run build
```

Outputs a static site to `dist/`. Preview it locally with `npm run preview`.

## Lint

```bash
npm run lint
```

## Deployment

This is a plain static SPA with no server-side rendering and no
router-based URLs (it's a single-page, tab-based dashboard) — it deploys to
any static host (Vercel, Netlify, Cloudflare Pages, etc.) with zero special
rewrite/fallback configuration. Build command `npm run build`, output
directory `dist`.

Before deploying to a real domain:

1. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as environment
   variables in the hosting platform's dashboard (not committed to git).
2. In the Supabase dashboard → Auth → URL Configuration, set **Site URL**
   (and add the domain under Additional Redirect URLs if needed) to your
   production domain — signup confirmation emails link back to whatever
   Site URL is configured there, so leaving it as a placeholder/localhost
   value will send users to the wrong place after deploying.

This repo does not deploy itself and does not include hosting-specific
config files — add a `vercel.json`/`netlify.toml` only if the target
platform's defaults don't already do the right thing (usually they do for a
Vite app).

## Security

- `.env` (and any `.env.*` variant) is git-ignored and must never be
  committed — only `.env.example` (placeholders) is tracked.
- The Supabase **anon/publishable key** is safe to ship in the frontend —
  that's its intended purpose — *as long as* RLS is correctly configured on
  every table, which it is (see `supabase/migrations/0002_rls_policies.sql`).
- The **service-role key must never** be exposed in the frontend, committed
  to this repo, or placed in `.env`/`.env.example`.
- SMTP/Resend credentials for Auth emails live only in the Supabase
  dashboard, never in this codebase.
- `supabase/.temp/` (Supabase CLI's local cache — it contains a live
  database connection string once you've linked a project) is git-ignored
  and must stay that way.
- Authorization is enforced by Postgres Row Level Security, not by hiding
  buttons in the UI — client-side role checks are a UX convenience, the
  database is the actual boundary.

## Project structure

```
src/
  App.jsx                 # top-level layout/state wiring (auth gate + dashboard)
  constants.js              # default UI labels, urgency colors
  hooks/
    useAuth.js               # session, profile (role/clinic), sign in/up/out
    usePharmacyData.js        # loads, live-syncs, and mutates the clinic's data
  lib/
    supabase.js               # Supabase client (from env vars)
    pharmacyApi.js             # all Supabase table/RPC queries, in one place
    auth.js                    # thin wrapper around supabase.auth + profile lookup
    migrateLegacyData.js       # one-time localStorage -> Supabase import
    dates.js, medications.js
  components/
    auth/                      # sign in / sign up screens
    forms/                     # small controlled forms used inside modals
    MigrationPrompt.jsx, SaveIndicator.jsx, MedCard.jsx, ...
  styles/
    styles.js                  # shared inline-style objects
    global.css                 # base resets + responsive layout rules
supabase/
  config.toml                  # Supabase CLI project config (committed)
  migrations/                  # schema, RLS policies, RPC functions (SQL, applied in order)
  README.md                     # detailed Supabase setup/operational guide
public/
  favicon.svg
```

There's no `src/pages/` — this app has no router and no distinct routed
screens (the Meds/First Aid/Log tabs are UI state, not routes), so a pages
folder would just wrap existing sections in an extra layer with nothing
behind it. `App.jsx` is the single top-level orchestrator; `components/`
holds everything else.

## Legacy data (localStorage → Supabase)

An earlier version of this app stored data in the browser's `localStorage`
only. `src/lib/migrateLegacyData.js` implements a one-time, safe import of
that data into Supabase: it never runs automatically, never deletes the
original localStorage entry, and refuses to run twice or onto a clinic that
already has cloud data. If you have an installation with old local data, an
admin will see an in-app prompt offering to migrate it on first sign-in.
