-- RPCs for the operations that must be atomic and/or need authorization
-- logic RLS alone can't express cleanly.
--
-- All three are SECURITY DEFINER so they can update rows a caller has no
-- direct UPDATE grant on (batches for staff withdrawals, first_aid_items qty
-- for staff adjustments, profiles.role for admin role changes) — but each
-- function performs its own auth.uid()/clinic/role checks internally before
-- touching anything, so this does not widen access beyond what's intended.

-- ---------------------------------------------------------------------------
-- withdraw_stock — the core FEFO withdrawal operation.
--
-- Concurrency: the candidate batch row is selected with `for update`, which
-- takes a row lock and makes a second, concurrent withdraw_stock() call on
-- the same medication BLOCK until the first transaction commits or rolls
-- back — it will then see the already-decremented qty and re-evaluate from
-- there. This guarantees no lost updates and no possibility of stock going
-- negative under concurrent withdrawals, at the cost of brief serialization
-- per medication (acceptable: pharmacy withdrawals are low-frequency human
-- actions, not a high-throughput workload). `for update` (not `skip locked`)
-- is used deliberately so FEFO ordering is never violated by skipping a
-- locked-but-earliest-expiring batch in favor of a later one.
--
-- p_batch_id = null  -> auto FEFO: earliest-expiry batch with qty > 0.
-- p_batch_id given    -> explicit batch (the "custom withdraw" form).
--
-- Repeated same-day withdrawals from the same batch by the same user are
-- merged into a single log row (qty accumulated), matching the app's
-- pre-existing behavior of collapsing rapid quick-withdraw taps.
-- ---------------------------------------------------------------------------
create or replace function withdraw_stock(
  p_medication_id uuid,
  p_qty integer,
  p_withdrawn_on date,
  p_batch_id uuid default null
)
returns withdrawal_logs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic_id uuid;
  v_med medications%rowtype;
  v_batch batches%rowtype;
  v_log withdrawal_logs%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select clinic_id into v_clinic_id from profiles where id = auth.uid();
  if v_clinic_id is null then
    raise exception 'no profile for current user' using errcode = '28000';
  end if;

  if p_qty is null or p_qty <= 0 then
    raise exception 'quantity must be positive' using errcode = '22023';
  end if;

  select * into v_med from medications
    where id = p_medication_id and clinic_id = v_clinic_id;
  if not found then
    raise exception 'medication not found in this clinic' using errcode = 'P0002';
  end if;

  if p_batch_id is not null then
    select * into v_batch from batches
      where id = p_batch_id
        and medication_id = p_medication_id
        and clinic_id = v_clinic_id
      for update;
  else
    select * into v_batch from batches
      where medication_id = p_medication_id
        and clinic_id = v_clinic_id
        and qty > 0
      order by expiry asc
      limit 1
      for update;
  end if;

  if not found or v_batch.id is null then
    raise exception 'no batch with available stock for this medication' using errcode = 'P0002';
  end if;

  if v_batch.qty < p_qty then
    raise exception 'insufficient stock: available % but requested %', v_batch.qty, p_qty
      using errcode = '22003';
  end if;

  update batches
    set qty = qty - p_qty
    where id = v_batch.id;

  -- collapse repeated same-day/same-batch/same-user withdrawals into one row
  select * into v_log from withdrawal_logs
    where clinic_id = v_clinic_id
      and medication_id = p_medication_id
      and batch_id = v_batch.id
      and withdrawn_on = p_withdrawn_on
      and performed_by = auth.uid()
    for update;

  if found then
    update withdrawal_logs
      set qty = qty + p_qty
      where id = v_log.id
      returning * into v_log;
  else
    insert into withdrawal_logs (
      clinic_id, medication_id, med_name, batch_id, expiry,
      qty, withdrawn_on, performed_by, performed_by_email
    )
    values (
      v_clinic_id, v_med.id, v_med.name, v_batch.id, v_batch.expiry,
      p_qty, p_withdrawn_on, auth.uid(),
      (select email from profiles where id = auth.uid())
    )
    returning * into v_log;
  end if;

  return v_log;
end;
$$;

revoke all on function withdraw_stock(uuid, integer, date, uuid) from public;
grant execute on function withdraw_stock(uuid, integer, date, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- adjust_first_aid — atomic +/-1 (or any delta) clamped at 0. Available to
-- any authenticated clinic member (staff can adjust first-aid stock, per the
-- existing product behavior), not just admins.
-- ---------------------------------------------------------------------------
create or replace function adjust_first_aid(
  p_id uuid,
  p_delta integer
)
returns first_aid_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic_id uuid;
  v_item first_aid_items%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select clinic_id into v_clinic_id from profiles where id = auth.uid();
  if v_clinic_id is null then
    raise exception 'no profile for current user' using errcode = '28000';
  end if;

  update first_aid_items
    set qty = greatest(0, qty + p_delta)
    where id = p_id and clinic_id = v_clinic_id
    returning * into v_item;

  if not found then
    raise exception 'first aid item not found in this clinic' using errcode = 'P0002';
  end if;

  return v_item;
end;
$$;

revoke all on function adjust_first_aid(uuid, integer) from public;
grant execute on function adjust_first_aid(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- set_user_role — the only way a profile's role can change. Admin-only,
-- restricted to the caller's own clinic, so an admin can never touch another
-- clinic's users even though profiles are technically one global table.
-- ---------------------------------------------------------------------------
create or replace function set_user_role(
  p_user_id uuid,
  p_role text
)
returns profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_clinic_id uuid;
  v_caller_role text;
  v_target profiles%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select clinic_id, role into v_caller_clinic_id, v_caller_role
    from profiles where id = auth.uid();

  if v_caller_role is distinct from 'admin' then
    raise exception 'only admins can change roles' using errcode = '42501';
  end if;

  if p_role not in ('admin', 'staff') then
    raise exception 'invalid role: %', p_role using errcode = '22023';
  end if;

  update profiles
    set role = p_role
    where id = p_user_id and clinic_id = v_caller_clinic_id
    returning * into v_target;

  if not found then
    raise exception 'user not found in this clinic' using errcode = 'P0002';
  end if;

  return v_target;
end;
$$;

revoke all on function set_user_role(uuid, text) from public;
grant execute on function set_user_role(uuid, text) to authenticated;
