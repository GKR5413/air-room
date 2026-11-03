create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_url text,
  bio text,
  topics text[] default '{}',
  is_staff boolean not null default false,
  created_at timestamptz not null default now()
);
create table follows (
  follower_id uuid references profiles(id) on delete cascade,
  followee_id uuid references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id)
);
create table user_blocks (
  blocker_id uuid references profiles(id) on delete cascade,
  blocked_id uuid references profiles(id) on delete cascade,
  primary key (blocker_id, blocked_id)
);
create table rooms (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  host_id uuid not null references profiles(id),
  title text not null,
  description text default '',
  topic text default '',
  language text default 'en',
  visibility text not null default 'public' check (visibility in ('public','unlisted')),
  status text not null default 'live' check (status in ('live','ended')),
  hands_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);
create table room_memberships (
  room_id uuid references rooms(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  role text not null default 'listener' check (role in ('host','moderator','speaker','listener')),
  updated_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
create table hand_requests (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','dismissed','withdrawn','invited')),
  created_at timestamptz not null default now()
);
create unique index one_pending_hand on hand_requests(room_id, user_id) where status = 'pending';
create table stage_invitations (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  invited_by uuid references profiles(id),
  status text not null default 'pending' check (status in ('pending','accepted','declined','expired','revoked')),
  created_at timestamptz not null default now()
);
create unique index one_pending_invite on stage_invitations(room_id, user_id) where status = 'pending';
create table room_bans (
  room_id uuid references rooms(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  banned_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
create table reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references profiles(id),
  room_id uuid references rooms(id) on delete set null,
  target_user_id uuid references profiles(id),
  reason text not null,
  details text default '',
  status text not null default 'open',
  created_at timestamptz not null default now()
);
create table moderation_actions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id) on delete cascade,
  actor_id uuid references profiles(id),
  target_id uuid,
  action text not null,
  created_at timestamptz not null default now()
);
-- All access goes through the server with the service role key. Lock tables down.
alter table profiles enable row level security;
alter table follows enable row level security;
alter table user_blocks enable row level security;
alter table rooms enable row level security;
alter table room_memberships enable row level security;
alter table hand_requests enable row level security;
alter table stage_invitations enable row level security;
alter table room_bans enable row level security;
alter table reports enable row level security;
alter table moderation_actions enable row level security;
-- Auto-create a profile on signup
create function handle_new_user() returns trigger language plpgsql security definer as $$
begin
  insert into profiles(id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();
