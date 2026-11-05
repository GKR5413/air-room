alter table public.profiles add column username text;
alter table public.profiles add constraint profiles_username_format
  check (username is null or username ~ '^[a-z0-9_]{3,24}$');
create unique index profiles_username_unique on public.profiles (lower(username));
alter table public.follows add constraint follows_no_self check (follower_id <> followee_id);
