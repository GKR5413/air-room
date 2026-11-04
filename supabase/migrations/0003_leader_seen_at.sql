-- Moderator succession: remember when a host/moderator was last seen connected, so that
-- if they all leave a speaker can be promoted after a short grace period.
-- Until this runs, succession is simply inactive (nothing else breaks). Safe to re-run.
alter table public.rooms add column if not exists leader_seen_at timestamptz;
