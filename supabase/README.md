# Supabase setup

This folder contains the full, reproducible database setup for Pharmacy
RASD's multi-device backend: schema, Row Level Security, RPC functions, the
signup trigger, and Realtime configuration. Nothing here is applied
automatically — it's applied once (per environment) via the migrations
below.

**Status:** these migrations have already been applied to the project this
codebase currently points at (via `.env`). `supabase migration list` should
show all six as present both locally and remotely; if you're pointing this
project at a **different**, fresh Supabase project, apply them first (below)
before running the app.

## Apply the migrations (Supabase CLI)

```bash
npx supabase login                              # one-time, opens a browser
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

The CLI is a devDependency (`npx supabase ...` works without a global
install). `supabase/config.toml` is already committed so `supabase init` does
not need to be re-run.

There is intentionally no "paste this into the SQL editor" instruction here
— the CLI applies the same `.sql` files directly and is the reproducible,
version-controlled path.

## What gets created

| File | Contents |
|---|---|
| `0001_schema.sql` | Tables (`clinics`, `profiles`, `categories`, `medications`, `batches`, `first_aid_items`, `withdrawal_logs`, `ui_labels`), constraints, indexes, `updated_at` triggers |
| `0002_rls_policies.sql` | Enables Row Level Security on every table + all policies + `auth_clinic_id()`/`auth_role()`/`is_admin()` helper functions |
| `0003_rpc_functions.sql` | `withdraw_stock()` (atomic FEFO withdrawal), `adjust_first_aid()` (atomic +/-1), `set_user_role()` (admin-only role changes) |
| `0004_auth_trigger.sql` | `handle_new_user()` trigger — auto-creates a `profiles` row (and the clinic + starter categories, on the very first signup) whenever someone signs up |
| `0005_realtime.sql` | Adds `categories`/`medications`/`batches`/`first_aid_items`/`withdrawal_logs` to the `supabase_realtime` publication |
| `0006_legacy_migration_rpc.sql` | `import_legacy_withdrawal_log()` — admin-only RPC used only by the one-time localStorage → Supabase import (`src/lib/migrateLegacyData.js`) |

## Changing the schema later

**Never edit an already-applied migration file.** Once a numbered file has
been pushed to any real project (even a test one), treat it as immutable —
editing it in place means environments that already ran the old version and
environments running the edited version silently disagree, with no record of
what changed. Instead:

1. Add a new file: `0007_<short_description>.sql` (next sequential number).
2. `npx supabase db push` applies only the new file — already-applied ones
   are skipped automatically (tracked in the `supabase_migrations` schema).

## Seed / demo data

There is currently no `supabase/seed.sql` — none of the six migrations above
insert anything except the small set of default starter categories created
per-clinic inside `handle_new_user()` (real product behavior, not demo data).
All current data in the linked project is manually-entered **test data**,
not seeded by any script in this repo.

If demo/sample data becomes useful later (e.g. for a staging environment or
onboarding demo), add it as `supabase/seed.sql` — Supabase's own convention
for optional, environment-specific data, run explicitly via
`supabase db reset` (local) or a deliberate one-off script, and kept
completely separate from the schema migrations above.

## After applying

1. Copy your project's **Project URL** and **anon/publishable key** (Settings
   → API) into `.env` (see `.env.example` at the repo root). **Never** put
   the `service_role` key in `.env`, `.env.example`, or anywhere under
   `src/` — anything prefixed `VITE_` is bundled straight into the browser
   build.
2. The first person to sign up in the app becomes the clinic's `admin`;
   everyone after them starts as `staff`. An admin can promote/demote other
   accounts later from the in-app Settings panel. **Current role
   permissions (who can withdraw, adjust first-aid stock, etc.) are the
   initial/test configuration and are expected to change** once the business
   finalizes the staff workflow — see the README's Security/Roles section.
3. Realtime must also be enabled at the project level (Database → Replication)
   if it isn't already — `0005_realtime.sql` only adds the tables to the
   publication, it doesn't turn Realtime on for the project.
4. **Auth email (SMTP):** this project uses Supabase Auth's custom SMTP
   (e.g. Resend) for signup-confirmation emails. That configuration lives
   entirely in the Supabase dashboard (Project Settings → Auth → SMTP
   Settings) — the SMTP host/API key is **not**, and must never be, present
   anywhere in this repository or in `.env`.
