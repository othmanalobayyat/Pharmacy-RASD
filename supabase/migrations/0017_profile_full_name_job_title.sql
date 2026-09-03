-- Adds editable "full name" and "job title" fields to the existing
-- `profiles` table (see 0001_schema.sql) — no new table. `profiles` is
-- already the 1:1 companion row for auth.users, which is exactly the
-- existing architecture the Profile page's account-info section already
-- reads (see src/lib/auth.js fetchProfile()).
--
-- full_name is deliberately NOT declared `not null` here, even though the
-- product requirement is "full name is required and must never be SAVED
-- empty." Those are two different things:
--   - "required to save" is enforced going forward in update_own_profile()
--     below (rejects empty/whitespace) and in the Profile UI.
--   - a blanket `not null` on the COLUMN would require backfilling every
--     existing row with a value right now. Nothing in this app has ever
--     collected a user's name (sign-up only asks for email/password — see
--     src/components/auth/SignUpForm.jsx), so for nearly every existing
--     profiles row there is no real name anywhere to backfill from. Inventing
--     one (e.g. from the email address) was explicitly ruled out. So this
--     migration backfills ONLY where a real name already exists (Supabase
--     Auth's own user_metadata, checked below), and leaves every other
--     existing row NULL — the Profile page already renders a "not set"
--     placeholder for that and lets the user fill in their own real name via
--     the new edit control, at which point it becomes permanently non-empty
--     for that user.
alter table profiles add column if not exists full_name text;

-- job_title is genuinely optional per the product requirement (add/change/
-- clear freely) — nullable text, no backfill needed.
alter table profiles add column if not exists job_title text;

-- Backfill from auth.users.raw_user_meta_data where an account already
-- carries a real name there (checks both "full_name" and "name", the two
-- keys a Supabase sign-up commonly populates) — genuine existing data only,
-- never fabricated. Rows with neither key are left NULL.
update profiles p
  set full_name = coalesce(
    nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(u.raw_user_meta_data ->> 'name'), '')
  )
  from auth.users u
  where u.id = p.id
    and p.full_name is null
    and coalesce(
      nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(u.raw_user_meta_data ->> 'name'), '')
    ) is not null;

-- ---------------------------------------------------------------------------
-- update_own_profile — the only way full_name/job_title can change.
--
-- profiles deliberately has NO direct UPDATE policy at all (see
-- 0002_rls_policies.sql — role changes go exclusively through
-- set_user_role()), specifically so a client update can never touch
-- role/clinic_id/email. This function keeps that invariant: it is
-- SECURITY DEFINER (same pattern as set_user_role()/withdraw_stock()) but
-- only ever touches full_name/job_title, and only ever on the CALLER'S OWN
-- row — `where id = auth.uid()`, never a client-supplied target id — so one
-- user can never update another user's profile, by construction, not by
-- policy.
-- ---------------------------------------------------------------------------
create or replace function update_own_profile(
  p_full_name text,
  p_job_title text
)
returns profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_full_name text;
  v_job_title text;
  v_target profiles%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  v_full_name := nullif(btrim(p_full_name), '');
  if v_full_name is null then
    raise exception 'الاسم الكامل مطلوب ولا يمكن أن يكون فارغًا' using errcode = '22023';
  end if;

  -- Empty/whitespace job title clears it (stored as NULL) — job title is
  -- optional, unlike full_name above.
  v_job_title := nullif(btrim(p_job_title), '');

  update profiles
    set full_name = v_full_name,
        job_title = v_job_title
    where id = auth.uid()
    returning * into v_target;

  if not found then
    raise exception 'no profile for current user' using errcode = 'P0002';
  end if;

  return v_target;
end;
$$;

revoke all on function update_own_profile(text, text) from public;
grant execute on function update_own_profile(text, text) to authenticated;
