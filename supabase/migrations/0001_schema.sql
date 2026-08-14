-- Pharmacy RASD — core schema
--
-- Single-clinic-per-deployment today (see 0004_auth_trigger.sql), but every
-- table carries a clinic_id so multi-clinic support later only requires
-- changing how clinic_id gets assigned, not the schema itself.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- clinics
-- ---------------------------------------------------------------------------
create table if not exists clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Pharmacy RASD Clinic',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- profiles — one row per authenticated user (auth.users), 1:1
-- ---------------------------------------------------------------------------
create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  clinic_id uuid not null references clinics (id) on delete restrict,
  email text not null,
  role text not null default 'staff' check (role in ('admin', 'staff')),
  created_at timestamptz not null default now()
);

create index if not exists profiles_clinic_id_idx on profiles (clinic_id);

-- ---------------------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------------------
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics (id) on delete cascade,
  name text not null check (char_length(btrim(name)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists categories_clinic_id_idx on categories (clinic_id);

-- ---------------------------------------------------------------------------
-- medications
-- ---------------------------------------------------------------------------
create table if not exists medications (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics (id) on delete cascade,
  category_id uuid references categories (id) on delete set null,
  name text not null check (char_length(btrim(name)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists medications_clinic_id_idx on medications (clinic_id);
create index if not exists medications_category_id_idx on medications (category_id);

-- ---------------------------------------------------------------------------
-- batches — FEFO stock lots per medication
-- ---------------------------------------------------------------------------
create table if not exists batches (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics (id) on delete cascade,
  medication_id uuid not null references medications (id) on delete cascade,
  expiry date not null,
  qty integer not null default 0 check (qty >= 0),
  added_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- FEFO selection scans "earliest expiry with qty > 0 for this medication" —
-- this index makes that scan an index range scan instead of a seq scan.
create index if not exists batches_med_expiry_idx
  on batches (medication_id, expiry)
  where qty > 0;
create index if not exists batches_clinic_id_idx on batches (clinic_id);

-- ---------------------------------------------------------------------------
-- first_aid_items
-- ---------------------------------------------------------------------------
create table if not exists first_aid_items (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics (id) on delete cascade,
  name text not null check (char_length(btrim(name)) > 0),
  qty integer not null default 0 check (qty >= 0),
  threshold integer not null default 0 check (threshold >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists first_aid_items_clinic_id_idx on first_aid_items (clinic_id);

-- ---------------------------------------------------------------------------
-- withdrawal_logs — append-only audit trail.
--
-- medication_id/batch_id are "on delete set null" (not cascade) so deleting a
-- medication or batch later can NEVER silently destroy historical log rows.
-- med_name/expiry are snapshotted at withdrawal time for the same reason —
-- a later rename must not rewrite history.
-- ---------------------------------------------------------------------------
create table if not exists withdrawal_logs (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics (id) on delete cascade,
  medication_id uuid references medications (id) on delete set null,
  med_name text not null,
  batch_id uuid references batches (id) on delete set null,
  expiry date,
  qty integer not null check (qty > 0),
  withdrawn_on date not null,
  performed_by uuid references profiles (id) on delete set null,
  performed_by_email text,
  created_at timestamptz not null default now()
);

create index if not exists withdrawal_logs_clinic_id_idx on withdrawal_logs (clinic_id);
create index if not exists withdrawal_logs_medication_id_idx on withdrawal_logs (medication_id);
create index if not exists withdrawal_logs_withdrawn_on_idx on withdrawal_logs (withdrawn_on);

-- ---------------------------------------------------------------------------
-- ui_labels — per-clinic editable UI text overrides (key/value)
-- ---------------------------------------------------------------------------
create table if not exists ui_labels (
  clinic_id uuid not null references clinics (id) on delete cascade,
  key text not null,
  value text not null,
  updated_at timestamptz not null default now(),
  primary key (clinic_id, key)
);

-- ---------------------------------------------------------------------------
-- updated_at maintenance trigger
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger categories_set_updated_at
  before update on categories
  for each row execute function set_updated_at();

create trigger medications_set_updated_at
  before update on medications
  for each row execute function set_updated_at();

create trigger batches_set_updated_at
  before update on batches
  for each row execute function set_updated_at();

create trigger first_aid_items_set_updated_at
  before update on first_aid_items
  for each row execute function set_updated_at();

create trigger ui_labels_set_updated_at
  before update on ui_labels
  for each row execute function set_updated_at();
