-- Supports the one-time legacy-localStorage -> Supabase migration
-- (src/lib/migrateLegacyData.js). This is a SEPARATE entry point from
-- withdraw_stock(): it inserts a historical log row as-is, without touching
-- any batch's qty, because the batch quantities being migrated already
-- reflect all of that history — replaying old withdrawals through
-- withdraw_stock() would double-decrement stock that's already accounted
-- for in the legacy numbers.
--
-- Admin-only, same reasoning as set_user_role(): a bulk historical import is
-- an administrative action, not a routine withdrawal.
create or replace function import_legacy_withdrawal_log(
  p_medication_id uuid,
  p_med_name text,
  p_batch_id uuid,
  p_expiry date,
  p_qty integer,
  p_withdrawn_on date
)
returns withdrawal_logs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic_id uuid;
  v_role text;
  v_log withdrawal_logs%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select clinic_id, role into v_clinic_id, v_role from profiles where id = auth.uid();

  if v_role is distinct from 'admin' then
    raise exception 'only admins can import legacy history' using errcode = '42501';
  end if;

  if p_qty is null or p_qty <= 0 then
    raise exception 'quantity must be positive' using errcode = '22023';
  end if;

  if p_med_name is null or char_length(btrim(p_med_name)) = 0 then
    raise exception 'medication name is required' using errcode = '22023';
  end if;

  insert into withdrawal_logs (
    clinic_id, medication_id, med_name, batch_id, expiry,
    qty, withdrawn_on, performed_by, performed_by_email
  )
  values (
    v_clinic_id, p_medication_id, p_med_name, p_batch_id, p_expiry,
    p_qty, p_withdrawn_on, auth.uid(),
    (select email from profiles where id = auth.uid())
  )
  returning * into v_log;

  return v_log;
end;
$$;

revoke all on function import_legacy_withdrawal_log(uuid, text, uuid, date, integer, date) from public;
grant execute on function import_legacy_withdrawal_log(uuid, text, uuid, date, integer, date) to authenticated;
