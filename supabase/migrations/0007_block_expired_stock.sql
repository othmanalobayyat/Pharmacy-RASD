-- Blocks withdrawal from expired batches.
--
-- Supersedes withdraw_stock() from 0003_rpc_functions.sql (that file is left
-- untouched — this is a new migration, per policy, not an edit of an applied
-- one). Same signature, same atomicity/locking behavior; the only change is
-- an added `expiry >= current_date` condition on BOTH the auto-FEFO branch
-- and the explicit-batch branch, so an already-expired batch can never be
-- dispensed via either the quick-withdraw button or the custom-withdraw
-- form. Writing off/removing expired stock still works via the existing
-- "delete batch" admin action, which this migration does not touch.
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

    if found and v_batch.expiry < current_date then
      raise exception 'لا يمكن صرف دفعة منتهية الصلاحية' using errcode = 'P0002';
    end if;
  else
    select * into v_batch from batches
      where medication_id = p_medication_id
        and clinic_id = v_clinic_id
        and qty > 0
        and expiry >= current_date
      order by expiry asc
      limit 1
      for update;
  end if;

  if not found or v_batch.id is null then
    raise exception 'لا يوجد مخزون صالح (غير منتهي الصلاحية) لهذا الدواء' using errcode = 'P0002';
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
