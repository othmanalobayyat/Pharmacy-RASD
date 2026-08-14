-- Row Level Security.
--
-- Every application table is scoped by clinic_id. Reads are allowed to any
-- authenticated member of the same clinic; direct writes are admin-only
-- except where noted. Quantity-changing operations (withdrawals, first-aid
-- +/-1 adjustments) do NOT have a direct UPDATE policy for staff — those go
-- exclusively through the SECURITY DEFINER RPCs in 0003_rpc_functions.sql,
-- which perform their own authorization + row locking. This means the
-- database enforces permissions; the frontend hiding a button is a UX
-- convenience only, never the actual boundary.

-- ---------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER, fixed search_path to avoid hijacking,
-- STABLE so the planner can cache them within a statement).
-- ---------------------------------------------------------------------------
create or replace function auth_clinic_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select clinic_id from profiles where id = auth.uid();
$$;

create or replace function auth_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from profiles where id = auth.uid();
$$;

create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth_role() = 'admin', false);
$$;

-- ---------------------------------------------------------------------------
-- clinics — members can read their own clinic's row only. No client
-- INSERT/UPDATE/DELETE; clinic creation happens only via the auth trigger.
-- ---------------------------------------------------------------------------
alter table clinics enable row level security;

create policy clinics_select_own on clinics
  for select
  using (id = auth_clinic_id());

-- ---------------------------------------------------------------------------
-- profiles — a user can read their own row and their clinic-mates' rows
-- (needed for the admin "team" list and for attributing log entries).
-- No direct UPDATE policy at all: role changes go exclusively through the
-- set_user_role() RPC so a staff member can never grant themselves admin.
-- ---------------------------------------------------------------------------
alter table profiles enable row level security;

create policy profiles_select_same_clinic on profiles
  for select
  using (id = auth.uid() or clinic_id = auth_clinic_id());

-- ---------------------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------------------
alter table categories enable row level security;

create policy categories_select on categories
  for select
  using (clinic_id = auth_clinic_id());

create policy categories_insert_admin on categories
  for insert
  with check (clinic_id = auth_clinic_id() and is_admin());

create policy categories_update_admin on categories
  for update
  using (clinic_id = auth_clinic_id() and is_admin())
  with check (clinic_id = auth_clinic_id());

create policy categories_delete_admin on categories
  for delete
  using (clinic_id = auth_clinic_id() and is_admin());

-- ---------------------------------------------------------------------------
-- medications
-- ---------------------------------------------------------------------------
alter table medications enable row level security;

create policy medications_select on medications
  for select
  using (clinic_id = auth_clinic_id());

create policy medications_insert_admin on medications
  for insert
  with check (clinic_id = auth_clinic_id() and is_admin());

create policy medications_update_admin on medications
  for update
  using (clinic_id = auth_clinic_id() and is_admin())
  with check (clinic_id = auth_clinic_id());

create policy medications_delete_admin on medications
  for delete
  using (clinic_id = auth_clinic_id() and is_admin());

-- ---------------------------------------------------------------------------
-- batches — admins can create/delete/correct batches directly. Quantity
-- decrements from a withdrawal are NOT done via these policies; they go
-- through withdraw_stock() (SECURITY DEFINER), which bypasses table RLS but
-- enforces its own clinic/stock checks. This lets staff withdraw stock
-- without granting staff a general UPDATE on batches.
-- ---------------------------------------------------------------------------
alter table batches enable row level security;

create policy batches_select on batches
  for select
  using (clinic_id = auth_clinic_id());

create policy batches_insert_admin on batches
  for insert
  with check (clinic_id = auth_clinic_id() and is_admin());

create policy batches_update_admin on batches
  for update
  using (clinic_id = auth_clinic_id() and is_admin())
  with check (clinic_id = auth_clinic_id());

create policy batches_delete_admin on batches
  for delete
  using (clinic_id = auth_clinic_id() and is_admin());

-- ---------------------------------------------------------------------------
-- first_aid_items — same pattern as batches: qty +/-1 adjustments go through
-- adjust_first_aid() (SECURITY DEFINER) so staff can adjust stock without a
-- general UPDATE grant; renaming/threshold changes stay admin-only here.
-- ---------------------------------------------------------------------------
alter table first_aid_items enable row level security;

create policy first_aid_items_select on first_aid_items
  for select
  using (clinic_id = auth_clinic_id());

create policy first_aid_items_insert_admin on first_aid_items
  for insert
  with check (clinic_id = auth_clinic_id() and is_admin());

create policy first_aid_items_update_admin on first_aid_items
  for update
  using (clinic_id = auth_clinic_id() and is_admin())
  with check (clinic_id = auth_clinic_id());

create policy first_aid_items_delete_admin on first_aid_items
  for delete
  using (clinic_id = auth_clinic_id() and is_admin());

-- ---------------------------------------------------------------------------
-- withdrawal_logs — read-only to clients. No INSERT/UPDATE/DELETE policy at
-- all: rows can only be created by withdraw_stock() (SECURITY DEFINER),
-- which makes the audit trail tamper-proof from the client's perspective.
-- ---------------------------------------------------------------------------
alter table withdrawal_logs enable row level security;

create policy withdrawal_logs_select on withdrawal_logs
  for select
  using (clinic_id = auth_clinic_id());

-- ---------------------------------------------------------------------------
-- ui_labels
-- ---------------------------------------------------------------------------
alter table ui_labels enable row level security;

create policy ui_labels_select on ui_labels
  for select
  using (clinic_id = auth_clinic_id());

create policy ui_labels_insert_admin on ui_labels
  for insert
  with check (clinic_id = auth_clinic_id() and is_admin());

create policy ui_labels_update_admin on ui_labels
  for update
  using (clinic_id = auth_clinic_id() and is_admin())
  with check (clinic_id = auth_clinic_id());

create policy ui_labels_delete_admin on ui_labels
  for delete
  using (clinic_id = auth_clinic_id() and is_admin());
