-- Prevents duplicate names (case-insensitive, whitespace-normalized) for
-- medications and first_aid_items, scoped per clinic.
--
-- NOTE: `categories` is deliberately NOT included in this migration. A
-- pre-flight check (see project notes) found an existing real duplicate in
-- the live project's `categories` table (two rows named "مسكنات" in the
-- same clinic — likely from the default-category seed in
-- 0004_auth_trigger.sql being inserted more than once, or a manual
-- duplicate). Resolving that is a data decision, not something this
-- migration should make unilaterally, so the categories uniqueness
-- constraint is deferred to a follow-up migration once it's resolved.
--
-- Enforced as a unique index on a normalized expression
-- (lower(btrim(name))), which Postgres checks on BOTH insert and update
-- automatically — renaming a medication to another existing medication's
-- name is rejected the same way creating a fresh duplicate is; no separate
-- trigger/RPC logic is needed for the update case.
--
-- Safety: before creating each index, this migration first scans for
-- existing duplicate (clinic_id, normalized name) groups and RAISES a clear
-- exception listing exactly which ones conflict, instead of letting
-- `create unique index` fail with a generic/cryptic Postgres error, and
-- instead of silently skipping or deleting any data.

do $$
declare
  v_conflicts text;
begin
  select string_agg(
    format('clinic_id=%s name="%s" (%s rows)', clinic_id, norm_name, cnt),
    E'\n'
  )
  into v_conflicts
  from (
    select clinic_id, lower(btrim(name)) as norm_name, count(*) as cnt
    from medications
    group by clinic_id, lower(btrim(name))
    having count(*) > 1
  ) dupes;

  if v_conflicts is not null then
    raise exception E'Cannot add unique constraint on medications — existing duplicate names must be resolved first:\n%', v_conflicts;
  end if;
end $$;

do $$
declare
  v_conflicts text;
begin
  select string_agg(
    format('clinic_id=%s name="%s" (%s rows)', clinic_id, norm_name, cnt),
    E'\n'
  )
  into v_conflicts
  from (
    select clinic_id, lower(btrim(name)) as norm_name, count(*) as cnt
    from first_aid_items
    group by clinic_id, lower(btrim(name))
    having count(*) > 1
  ) dupes;

  if v_conflicts is not null then
    raise exception E'Cannot add unique constraint on first_aid_items — existing duplicate names must be resolved first:\n%', v_conflicts;
  end if;
end $$;

create unique index if not exists medications_clinic_norm_name_idx
  on medications (clinic_id, lower(btrim(name)));

create unique index if not exists first_aid_items_clinic_norm_name_idx
  on first_aid_items (clinic_id, lower(btrim(name)));
