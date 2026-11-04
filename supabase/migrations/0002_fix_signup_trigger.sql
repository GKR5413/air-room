-- Fixes "Database error saving new user" on signup for databases that already ran
-- the original 0001_init.sql (its trigger function used an unqualified table name,
-- which Supabase Auth could not resolve). Safe to run more than once.

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, display_name)
  values (new.id, coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), split_part(new.email,'@',1)))
  on conflict (id) do nothing;
  return new;
end $$;

-- The existing trigger keeps pointing at this function name; recreate it to be certain.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for any users created while signup was broken or before the trigger existed.
insert into public.profiles (id, display_name)
select id, coalesce(nullif(raw_user_meta_data->>'display_name', ''), split_part(email, '@', 1))
from auth.users
on conflict (id) do nothing;
