-- Completes 0008_prevent_duplicate_names.sql for the one table it
-- deliberately left out: `categories`. That migration found a real existing
-- duplicate ("مسكنات" appeared twice in the same clinic) and was split so
-- medications/first_aid_items could be protected immediately without
-- blocking on a data decision. The duplicate has since been resolved
-- manually (confirmed: a live check on 2026-08-17 found zero remaining
-- duplicate category names under the (clinic_id, lower(btrim(name)))
-- normalization).
--
-- Same safety pattern as 0008: re-check for duplicates immediately before
-- creating the index (not just trusting the earlier manual fix), so this
-- migration fails loudly and safely instead of silently if that assumption
-- is ever wrong when applied to another environment.

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
    from categories
    group by clinic_id, lower(btrim(name))
    having count(*) > 1
  ) dupes;

  if v_conflicts is not null then
    raise exception E'Cannot add unique constraint on categories — existing duplicate names must be resolved first:\n%', v_conflicts;
  end if;
end $$;

create unique index if not exists categories_clinic_norm_name_idx
  on categories (clinic_id, lower(btrim(name)));
