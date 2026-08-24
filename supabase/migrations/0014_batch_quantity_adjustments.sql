-- Batch quantity correction, with an audit trail.
--
-- Problem this solves: previously the only way to fix a data-entry mistake
-- in a batch's quantity (e.g. "500" typed instead of "50") was to delete the
-- batch and recreate it — which silently destroys whatever partial history
-- existed on that batch row and leaves no record that a correction ever
-- happened. This migration adds a proper, audited, atomic correction path.
--
-- ---------------------------------------------------------------------------
-- batch_quantity_adjustments — append-only audit trail for corrections.
--
-- batch_id / medication_id are "on delete set null" (NOT cascade), exactly
-- mirroring withdrawal_logs' existing design (see 0001_schema.sql): a
-- correction that happened on a batch or medication must remain in the audit
-- history even if that batch/medication is later deleted — deleting
-- inventory must never be able to erase the record that someone corrected
-- its quantity. reason/old_qty/new_qty/delta/performed_by/created_at are
-- never nullable — those facts about the correction itself don't depend on
-- whether the batch still exists.
-- ---------------------------------------------------------------------------
create table if not exists batch_quantity_adjustments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics (id) on delete cascade,
  batch_id uuid references batches (id) on delete set null,
  medication_id uuid references medications (id) on delete set null,
  old_qty integer not null check (old_qty >= 0),
  new_qty integer not null check (new_qty >= 0),
  delta integer not null,
  reason text not null check (char_length(btrim(reason)) > 0),
  performed_by uuid references profiles (id) on delete set null,
  performed_by_email text,
  created_at timestamptz not null default now()
);

create index if not exists batch_quantity_adjustments_clinic_id_idx
  on batch_quantity_adjustments (clinic_id);
create index if not exists batch_quantity_adjustments_batch_id_idx
  on batch_quantity_adjustments (batch_id);
create index if not exists batch_quantity_adjustments_medication_id_idx
  on batch_quantity_adjustments (medication_id);
create index if not exists batch_quantity_adjustments_clinic_created_at_idx
  on batch_quantity_adjustments (clinic_id, created_at desc);

-- Same tamper-proof-from-the-client pattern as withdrawal_logs
-- (0002_rls_policies.sql): readable by the clinic, writable ONLY through the
-- SECURITY DEFINER RPC below, never by a direct client insert/update/delete.
alter table batch_quantity_adjustments enable row level security;

create policy batch_quantity_adjustments_select on batch_quantity_adjustments
  for select
  using (clinic_id = auth_clinic_id());

-- ---------------------------------------------------------------------------
-- adjust_batch_qty — the only way a batch's quantity can be corrected.
--
-- Quantity correction is treated as an administrative action, consistent
-- with the existing model where batch insert/update/delete are already
-- admin-only (batches_insert_admin/update_admin/delete_admin,
-- 0002_rls_policies.sql) — this does not invent a new permission tier, it
-- follows the one that already exists for every other batch-level change.
--
-- Atomicity: the row lock (`for update`), the qty update, and the audit
-- insert all happen inside this one function body, which Postgres runs as a
-- single transaction — if the audit insert fails for any reason, the qty
-- update is rolled back with it, so it is never possible for the quantity to
-- change without a matching audit row (and vice versa).
--
-- Concurrency: `for update` locks the target batch row, so two concurrent
-- corrections (or a correction racing a withdrawal via withdraw_stock(),
-- which also locks batches one row at a time) serialize on that single row
-- instead of one silently overwriting the other's old_qty snapshot.
create or replace function adjust_batch_qty(
  p_batch_id uuid,
  p_new_qty integer,
  p_reason text
)
returns batches
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic_id uuid;
  v_role text;
  v_batch batches%rowtype;
  v_old_qty integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select clinic_id, role into v_clinic_id, v_role from profiles where id = auth.uid();
  if v_clinic_id is null then
    raise exception 'no profile for current user' using errcode = '28000';
  end if;

  if v_role is distinct from 'admin' then
    raise exception 'only admins can adjust batch quantities' using errcode = '42501';
  end if;

  if p_new_qty is null or p_new_qty < 0 then
    raise exception 'quantity must be zero or a positive integer' using errcode = '22023';
  end if;

  if p_reason is null or char_length(btrim(p_reason)) = 0 then
    raise exception 'a reason is required' using errcode = '22023';
  end if;

  select * into v_batch from batches
    where id = p_batch_id and clinic_id = v_clinic_id
    for update;

  if not found then
    raise exception 'batch not found in this clinic' using errcode = 'P0002';
  end if;

  v_old_qty := v_batch.qty;

  if p_new_qty = v_old_qty then
    raise exception 'الكمية الجديدة مطابقة للكمية الحالية' using errcode = 'P0004';
  end if;

  update batches set qty = p_new_qty where id = v_batch.id
    returning * into v_batch;

  insert into batch_quantity_adjustments (
    clinic_id, batch_id, medication_id, old_qty, new_qty, delta, reason,
    performed_by, performed_by_email
  )
  values (
    v_clinic_id, v_batch.id, v_batch.medication_id, v_old_qty, p_new_qty,
    p_new_qty - v_old_qty, btrim(p_reason),
    auth.uid(), (select email from profiles where id = auth.uid())
  );

  return v_batch;
end;
$$;

revoke all on function adjust_batch_qty(uuid, integer, text) from public;
grant execute on function adjust_batch_qty(uuid, integer, text) to authenticated;
