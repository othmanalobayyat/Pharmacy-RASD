-- Guarantees a clinic can never end up with zero admins.
--
-- Supersedes set_user_role() from 0003_rpc_functions.sql (untouched, per
-- policy). Same signature/authorization; the only change is a new guard
-- that rejects demoting a clinic's LAST remaining admin to staff.
--
-- This is the only place role can change at all: profiles has RLS enabled
-- with no direct UPDATE policy (see 0002_rls_policies.sql), and there is no
-- delete-user functionality anywhere in this project (inspected the schema,
-- RLS policies, and UI — profiles rows are never deleted by the app), so
-- set_user_role() is the sole gateway that needs protecting.
--
-- Concurrency: two admins in a 2-admin clinic could otherwise race to demote
-- each other in two separate transactions, each reading "count = 2" before
-- either commits, both passing the check, leaving zero admins. To prevent
-- this, this function locks every currently-admin row of the clinic with
-- `select ... for update` BEFORE evaluating the count. If a second
-- concurrent call also needs to lock an overlapping set of admin rows (true
-- whenever fewer than "all other admins" are being changed, i.e. always
-- relevant here since a clinic's full admin set is locked each time), it
-- blocks until the first transaction commits — then re-reads the row lock
-- against the now-updated data, so the check is always atomic and current.
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
  v_admin_count integer;
  v_target_is_admin boolean;
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

  if p_role = 'staff' then
    -- Lock every current admin row of this clinic (including the target's,
    -- if they are currently admin) before counting — see concurrency note
    -- above. This must run even when demoting a single admin in a
    -- multi-admin clinic, so the count it reads is always transaction-safe.
    select count(*) into v_admin_count
      from profiles
      where clinic_id = v_caller_clinic_id and role = 'admin'
      for update;

    select (role = 'admin') into v_target_is_admin
      from profiles
      where id = p_user_id and clinic_id = v_caller_clinic_id;

    if coalesce(v_target_is_admin, false) and v_admin_count <= 1 then
      raise exception 'لا يمكن إزالة صلاحية المسؤول عن آخر مسؤول في الصيدلية' using errcode = 'P0003';
    end if;
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
