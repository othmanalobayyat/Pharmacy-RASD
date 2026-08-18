-- Fixes a real concurrency bug in 0012_protect_last_admin.sql (left
-- untouched, per policy — this migration supersedes it, same pattern as
-- 0007/0010 superseding withdraw_stock()).
--
-- The problem with 0012's approach:
--   select count(*) from profiles where clinic_id = ... and role = 'admin'
--   for update;
-- `for update` locks the rows an aggregate query READS, but the lock is
-- only held for rows that exist AT THE TIME of that scan. It does not
-- prevent a second, concurrent transaction from running the exact same
-- aggregate query concurrently and both computing "count = 2" from
-- MVCC-consistent snapshots before either commits — `for update` on an
-- aggregate is not the same thing as serializing the aggregate itself, and
-- in practice it also mixes awkwardly with `count(*)` (which Postgres
-- computes over the locked+visible rows) and DOES NOT provide the
-- transaction-wide mutual exclusion this operation actually needs.
--
-- Fix: pg_advisory_xact_lock(), keyed deterministically off the clinic's
-- id. It is:
--   - transaction-scoped: acquired once, held for the rest of THIS
--     transaction, and released automatically on COMMIT or ROLLBACK — no
--     manual unlock call, and no way to leak the lock past this function.
--   - a real mutual-exclusion primitive: a second concurrent call for the
--     SAME clinic blocks on this line until the first transaction ends,
--     then proceeds against the now-committed data — unlike `for update`
--     on an aggregate, this genuinely serializes the whole
--     check-then-act critical section (read count -> validate -> update),
--     not just a snapshot read of some rows.
--   - deterministic and stable for a given clinic_id: the same clinic
--     always maps to the same 64-bit lock key (derived from md5(clinic_id
--     as text), taking the first 64 bits as a bigint — a standard technique
--     for turning an arbitrary stable string, e.g. a UUID, into a bigint
--     lock key). It is NOT session-local or random, and does not depend on
--     which admin/session acquires it — every set_user_role() call for the
--     same clinic contends for the exact same key.
--
-- Critical section (only needed on the risky path — promoting staff to
-- admin can never violate the "at least one admin" invariant, so it is not
-- locked):
--   acquire clinic-specific advisory xact lock
--   read current admin count for the clinic
--   determine whether the target user is currently admin
--   reject if role=staff and target is the last admin
--   update role
--   (lock auto-released at COMMIT/ROLLBACK of the calling transaction)
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
  v_lock_key bigint;
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
    -- Deterministic 64-bit key derived from this clinic's id. Same clinic
    -- -> same key, every time, for every caller — required for the lock to
    -- actually serialize concurrent calls against the same clinic.
    v_lock_key := ('x' || substr(md5(v_caller_clinic_id::text), 1, 16))::bit(64)::bigint;

    -- Blocks here until no other transaction holds this clinic's lock.
    -- Transaction-scoped: released automatically at COMMIT/ROLLBACK, so a
    -- second concurrent demotion attempt for the same clinic cannot
    -- proceed past this line until the first one has fully committed (or
    -- rolled back) its role update.
    perform pg_advisory_xact_lock(v_lock_key);

    select count(*) into v_admin_count
      from profiles
      where clinic_id = v_caller_clinic_id and role = 'admin';

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
