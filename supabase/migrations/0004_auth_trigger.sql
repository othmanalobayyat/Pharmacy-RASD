-- Bootstraps a profile row whenever a new auth.users row is created
-- (i.e. right after supabase.auth.signUp()).
--
-- Tenancy model: this deployment is single-clinic. The trigger reuses the
-- first (oldest) clinic row if one exists, or creates it on the very first
-- signup. The first person to ever sign up becomes 'admin'; everyone after
-- them defaults to 'staff' (an existing admin can promote others later via
-- set_user_role()). clinic_id lives on every table already, so switching to
-- a real multi-clinic signup flow (invite codes, clinic picker, etc.) later
-- only means replacing the body of this trigger — no schema changes needed.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic_id uuid;
  v_role text;
begin
  select id into v_clinic_id from clinics order by created_at asc limit 1;

  if v_clinic_id is null then
    insert into clinics (name) values ('Pharmacy RASD Clinic')
      returning id into v_clinic_id;

    -- Seed the same starter categories the original localStorage-only app
    -- shipped with (src/constants.js DEFAULT_CATEGORIES), so a brand-new
    -- clinic doesn't start from a completely empty sidebar.
    insert into categories (clinic_id, name) values
      (v_clinic_id, 'دهانات وكريمات'),
      (v_clinic_id, 'ضغط الدم'),
      (v_clinic_id, 'مسكنات'),
      (v_clinic_id, 'مضادات حيوية'),
      (v_clinic_id, 'سكري');
  end if;

  select case when exists (
    select 1 from profiles where clinic_id = v_clinic_id
  ) then 'staff' else 'admin' end into v_role;

  insert into profiles (id, clinic_id, email, role)
    values (new.id, v_clinic_id, new.email, v_role);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
