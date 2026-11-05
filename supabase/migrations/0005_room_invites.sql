-- Room invitations are separate from invitations to speak on stage.
create table public.room_invites (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'dismissed')),
  created_at timestamptz not null default now(),
  unique (room_id, recipient_id),
  check (sender_id <> recipient_id)
);
create index room_invites_inbox on public.room_invites(recipient_id, created_at desc) where status = 'pending';
alter table public.room_invites enable row level security;
