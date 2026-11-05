-- Requires 0005 (room_invites) to be applied first. leader_seen_at is also added by 0003;
-- repeating it here keeps this migration safe to apply on a database that skipped 0003.
alter table public.rooms add column if not exists leader_seen_at timestamptz;

-- Broadcast invalidations, never profile data, follower IDs, invitations or room contents.
-- Clients re-fetch through the existing authorized API after receiving a change.
-- Broadcasts are sent with private = true on purpose: only subscribers that pass this policy
-- receive them. Guests connect as `anon` (cookie identity, no Supabase JWT), so the shared
-- topics below are open to anon, while airroom:user:<id> is limited to that signed-in user.
create policy airroom_receive_updates on realtime.messages for select to anon, authenticated
using (
  extension = 'broadcast' and (
    realtime.topic() in ('airroom:hallway', 'airroom:profiles')
    -- Room links are already accessible by slug, including unlisted guest links.
    or realtime.topic() ~ '^airroom:room:[a-z0-9]{4,16}$'
    -- anon has no auth.uid(), so guests never match; users match only their own topic.
    or ((select auth.uid()) is not null and realtime.topic() = 'airroom:user:' || (select auth.uid())::text)
  )
);

create or replace function public.airroom_notify_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  row_data jsonb;
  old_data jsonb;
  room_slug text;
  person text;
begin
  if tg_op <> 'DELETE' then row_data := to_jsonb(new); else row_data := to_jsonb(old); end if;
  if tg_op <> 'INSERT' then old_data := to_jsonb(old); end if;
  if tg_table_name = 'rooms' then
    -- Presence bookkeeping must not cause an endless state -> write -> refresh loop.
    if tg_op = 'UPDATE' and (row_data - 'leader_seen_at') = (old_data - 'leader_seen_at') then return null; end if;
    perform realtime.send('{}'::jsonb, 'change', 'airroom:room:' || (row_data->>'slug'), true);
    if row_data->>'visibility' = 'public' or old_data->>'visibility' = 'public' then
      perform realtime.send('{}'::jsonb, 'change', 'airroom:hallway', true);
    end if;
  elsif tg_table_name = 'profiles' then
    perform realtime.send('{}'::jsonb, 'change', 'airroom:profiles', true);
    perform realtime.send('{}'::jsonb, 'change', 'airroom:user:' || (row_data->>'id'), true);
  elsif tg_table_name = 'follows' then
    for person in select distinct value from unnest(array[row_data->>'follower_id', row_data->>'followee_id', old_data->>'follower_id', old_data->>'followee_id']) as ids(value) where value is not null loop
      perform realtime.send('{}'::jsonb, 'change', 'airroom:user:' || person, true);
    end loop;
  else
    select slug into room_slug from public.rooms where id = (row_data->>'room_id')::uuid;
    if room_slug is not null then
      perform realtime.send('{}'::jsonb, 'change', 'airroom:room:' || room_slug, true);
      if tg_table_name = 'room_memberships' and exists(select 1 from public.rooms where slug = room_slug and visibility = 'public') then
        perform realtime.send('{}'::jsonb, 'change', 'airroom:hallway', true);
      end if;
    end if;
    if tg_table_name = 'room_invites' then
      perform realtime.send('{}'::jsonb, 'change', 'airroom:user:' || (row_data->>'recipient_id'), true);
    elsif tg_table_name = 'stage_invitations' then
      perform realtime.send('{}'::jsonb, 'change', 'airroom:user:' || (row_data->>'user_id'), true);
    end if;
  end if;
  return null;
end $$;

-- Existing table RLS stays locked: broadcasts contain only an empty invalidation signal.
create trigger airroom_rooms_live after insert or update or delete on public.rooms for each row execute function public.airroom_notify_change();
create trigger airroom_profiles_live after insert or update or delete on public.profiles for each row execute function public.airroom_notify_change();
create trigger airroom_follows_live after insert or update or delete on public.follows for each row execute function public.airroom_notify_change();
create trigger airroom_members_live after insert or update or delete on public.room_memberships for each row execute function public.airroom_notify_change();
create trigger airroom_hands_live after insert or update or delete on public.hand_requests for each row execute function public.airroom_notify_change();
create trigger airroom_stage_invites_live after insert or update or delete on public.stage_invitations for each row execute function public.airroom_notify_change();
create trigger airroom_bans_live after insert or update or delete on public.room_bans for each row execute function public.airroom_notify_change();
create trigger airroom_room_invites_live after insert or update or delete on public.room_invites for each row execute function public.airroom_notify_change();

-- Claim the room and save the role in one transaction: concurrent state requests
-- must not see a claimed room whose new moderator is still a speaker.
create or replace function public.claim_room_moderator(p_room_id uuid, p_user_id uuid, p_seen_at timestamptz)
returns boolean language plpgsql security definer set search_path = public as $$
declare current_seen timestamptz;
begin
  select leader_seen_at into current_seen from public.rooms where id = p_room_id and status = 'live' for update;
  if not found or current_seen is distinct from p_seen_at then return false; end if;
  update public.room_memberships set role = 'moderator', updated_at = now()
    where room_id = p_room_id and user_id = p_user_id and role = 'speaker';
  if not found then return false; end if;
  update public.rooms set leader_seen_at = now() where id = p_room_id;
  return true;
end $$;
revoke all on function public.claim_room_moderator(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.claim_room_moderator(uuid, uuid, timestamptz) to service_role;
