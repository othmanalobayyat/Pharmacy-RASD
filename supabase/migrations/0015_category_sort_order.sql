-- Admin-only, drag-and-drop, persisted category ordering.
--
-- Adds a single new column (categories.sort_order) plus one trigger (to
-- auto-place newly created categories at the end of the list) and one
-- atomic RPC (to persist a full reorder from a drag-and-drop in one
-- transaction, instead of a series of independent client-side updates that
-- could leave the list temporarily/permanently inconsistent). No existing
-- table, policy, or previously-applied migration is touched.

-- ---------------------------------------------------------------------------
-- categories.sort_order
--
-- Backfilled deterministically from the SAME order the app already displays
-- categories in today (created_at ascending — see fetchClinicData() in
-- src/lib/pharmacyApi.js, which orders categories by created_at asc), with
-- `id` as a tiebreaker for rows inserted in the same instant (e.g. the
-- multi-row default-category seed in 0004_auth_trigger.sql, whose rows can
-- share one `now()` timestamp). This means applying this migration does not
-- visibly reorder anything — existing clinics keep exactly the category
-- order they already see today, just now stored explicitly instead of
-- implied by insertion order.
-- ---------------------------------------------------------------------------
alter table categories add column if not exists sort_order integer;

with ranked as (
  select id, row_number() over (
    partition by clinic_id order by created_at asc, id asc
  ) as rn
  from categories
  where sort_order is null
)
update categories c
  set sort_order = ranked.rn
  from ranked
  where ranked.id = c.id;

alter table categories alter column sort_order set not null;

-- Supports "order by clinic_id, sort_order" efficiently, same pattern as
-- withdrawal_logs_clinic_created_at_idx (0011_paginate_withdrawal_logs_index.sql).
create index if not exists categories_clinic_sort_order_idx
  on categories (clinic_id, sort_order);

-- ---------------------------------------------------------------------------
-- New categories are placed at the end of their clinic's list automatically
-- (never disturbing existing positions), regardless of insert path — covers
-- both createCategory() (src/lib/pharmacyApi.js) and any future admin
-- category-seeding. Runs with the INSERTing user's own privileges (not
-- SECURITY DEFINER) — reading the clinic's current max sort_order only
-- needs the SELECT already granted by categories_select
-- (0002_rls_policies.sql), and the caller already has INSERT rights via
-- categories_insert_admin, so no privilege escalation is needed here.
-- ---------------------------------------------------------------------------
create or replace function set_category_sort_order()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.sort_order is null then
    select coalesce(max(sort_order), 0) + 1 into new.sort_order
      from categories where clinic_id = new.clinic_id;
  end if;
  return new;
end;
$$;

drop trigger if exists categories_set_sort_order on categories;

create trigger categories_set_sort_order
  before insert on categories
  for each row execute function set_category_sort_order();

-- ---------------------------------------------------------------------------
-- reorder_categories — the only way category order can change. Persists a
-- drag-and-drop result atomically: either the whole new order is applied, or
-- none of it is (a single function body is one transaction), so there is no
-- window where the list is left half-reordered.
--
-- Admin-only, the same authorization pattern as every other privileged RPC
-- in this project (set_user_role, adjust_batch_qty, ...): resolves the
-- caller's clinic/role from auth.uid() -> profiles, never trusts a
-- clinic_id supplied by the client. Requires the FULL, current set of the
-- clinic's category ids (not a partial list) — this is the simplest correct
-- way to reject a foreign/partial/duplicated id list outright rather than
-- guessing what to do with categories the caller didn't mention.
-- ---------------------------------------------------------------------------
create or replace function reorder_categories(p_category_ids uuid[])
returns setof categories
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic_id uuid;
  v_role text;
  v_expected_count integer;
  v_id uuid;
  v_position integer := 1;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select clinic_id, role into v_clinic_id, v_role from profiles where id = auth.uid();
  if v_clinic_id is null then
    raise exception 'no profile for current user' using errcode = '28000';
  end if;

  if v_role is distinct from 'admin' then
    raise exception 'only admins can reorder categories' using errcode = '42501';
  end if;

  if p_category_ids is null or array_length(p_category_ids, 1) is null then
    raise exception 'category id list must not be empty' using errcode = '22023';
  end if;

  if (select count(distinct x) from unnest(p_category_ids) x) <> array_length(p_category_ids, 1) then
    raise exception 'duplicate category id in reorder list' using errcode = '22023';
  end if;

  select count(*) into v_expected_count from categories where clinic_id = v_clinic_id;
  if array_length(p_category_ids, 1) <> v_expected_count then
    raise exception 'category id list does not match this clinic''s categories' using errcode = '22023';
  end if;

  if exists (
    select 1 from unnest(p_category_ids) x
    where not exists (
      select 1 from categories c where c.id = x and c.clinic_id = v_clinic_id
    )
  ) then
    raise exception 'one or more category ids do not belong to this clinic' using errcode = '42501';
  end if;

  foreach v_id in array p_category_ids loop
    update categories set sort_order = v_position where id = v_id;
    v_position := v_position + 1;
  end loop;

  return query
    select * from categories
    where clinic_id = v_clinic_id
    order by sort_order asc, created_at asc, id asc;
end;
$$;

revoke all on function reorder_categories(uuid[]) from public;
grant execute on function reorder_categories(uuid[]) to authenticated;
