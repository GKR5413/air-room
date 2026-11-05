-- Private chat between people who follow each other: text, voice notes, and call history.
-- All access goes through the app's API (service role), which checks that both people follow
-- each other, so these tables stay locked (RLS on, no policies) like the rest of the schema.
-- Needs migration 0006 (realtime.send and the Realtime authorization setup).

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.profiles(id) on delete cascade,
  user_b uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_id uuid,
  last_message_at timestamptz not null default now(),
  -- One conversation per pair: the smaller id is always user_a.
  constraint conversations_ordered check (user_a < user_b),
  constraint conversations_pair unique (user_a, user_b)
);
create index conversations_user_a on public.conversations (user_a, last_message_at desc);
create index conversations_user_b on public.conversations (user_b, last_message_at desc);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('text', 'voice', 'call')),
  body text not null default '',          -- text, or the call outcome (completed/missed/declined/canceled)
  audio text,                              -- voice notes: a data URL, served only to the two people in the chat
  duration_ms integer,                     -- voice length, or how long a call lasted
  call_kind text check (call_kind in ('audio', 'video')),
  created_at timestamptz not null default now()
);
create index messages_conversation on public.messages (conversation_id, created_at desc);

create table public.conversation_reads (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table public.calls (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  caller_id uuid not null references public.profiles(id) on delete cascade,
  callee_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('audio', 'video')),
  status text not null default 'ringing' check (status in ('ringing', 'accepted', 'declined', 'canceled', 'missed', 'ended')),
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  ended_at timestamptz,
  last_ping_at timestamptz not null default now(),   -- heartbeat while a call is connected
  constraint calls_two_people check (caller_id <> callee_id)
);
create index calls_callee_open on public.calls (callee_id) where status in ('ringing', 'accepted');
create index calls_caller_open on public.calls (caller_id) where status in ('ringing', 'accepted');

alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.conversation_reads enable row level security;
alter table public.calls enable row level security;

-- Live updates: an empty "something changed" signal on each person's private chat channel.
-- Clients then re-fetch through the authorized API, so no message content is ever broadcast.
create or replace function public.airroom_chat_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare a uuid; b uuid;
begin
  if tg_table_name = 'messages' then
    select user_a, user_b into a, b from public.conversations where id = new.conversation_id;
  elsif tg_table_name = 'calls' then
    a := new.caller_id; b := new.callee_id;
  else -- conversation_reads: only the reader's own devices need to refresh their unread badge
    a := new.user_id;
  end if;
  if a is not null then perform realtime.send('{}'::jsonb, 'change', 'airroom:chat:' || a, true); end if;
  if b is not null then perform realtime.send('{}'::jsonb, 'change', 'airroom:chat:' || b, true); end if;
  return null;
end $$;

create trigger airroom_messages_chat after insert on public.messages for each row execute function public.airroom_chat_notify();
create trigger airroom_calls_chat after insert or update on public.calls for each row execute function public.airroom_chat_notify();
create trigger airroom_reads_chat after insert or update on public.conversation_reads for each row execute function public.airroom_chat_notify();

-- Each signed-in person may listen only to their own chat channel.
create policy airroom_receive_chat on realtime.messages for select to authenticated
using (
  extension = 'broadcast'
  and (select auth.uid()) is not null
  and realtime.topic() = 'airroom:chat:' || (select auth.uid())::text
);
