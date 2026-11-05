import { admin } from '@/lib/supabase-admin';
import { route, requireUser, fail } from '@/lib/auth';
import { rankRecommendations, type Candidate } from '@/lib/recommend';

// Keep every `.in(...)` list short: ids go into the request URL.
const MAX_FOLLOWING = 100;
const MAX_ROOMS = 40;
const POOL = 60;

/**
 * Suggested people to follow, built from existing users:
 *  - they already follow you
 *  - people you follow also follow them (mutual connections)
 *  - you were both members of the same room
 *  - popularity, then newest members, so a small app still gets suggestions
 * People you already follow, yourself, and anyone blocked either way are never suggested.
 */
export const GET = route(async (req) => {
  const u = await requireUser(req);

  const [following, followers, iBlocked, blockedMe, myRooms] = await Promise.all([
    admin.from('follows').select('followee_id').eq('follower_id', u.id),
    admin.from('follows').select('follower_id').eq('followee_id', u.id),
    admin.from('user_blocks').select('blocked_id').eq('blocker_id', u.id),
    admin.from('user_blocks').select('blocker_id').eq('blocked_id', u.id),
    admin.from('room_memberships').select('room_id').eq('user_id', u.id).order('updated_at', { ascending: false }).limit(MAX_ROOMS),
  ]);
  if (following.error || followers.error || iBlocked.error || blockedMe.error || myRooms.error) fail(500, 'Could not load recommendations');

  const followingIds = new Set((following.data ?? []).map(r => r.followee_id as string));
  const followerIds = new Set((followers.data ?? []).map(r => r.follower_id as string));
  const excluded = new Set<string>([
    u.id, ...followingIds,
    ...(iBlocked.data ?? []).map(r => r.blocked_id as string),
    ...(blockedMe.data ?? []).map(r => r.blocker_id as string),
  ]);

  // Mutual connections: who do the people I follow follow?
  const mutuals = new Map<string, number>();
  const viaIds = [...followingIds].slice(0, MAX_FOLLOWING);
  if (viaIds.length) {
    const { data, error } = await admin.from('follows').select('followee_id').in('follower_id', viaIds).limit(2000);
    if (error) fail(500, 'Could not load recommendations');
    for (const r of data ?? []) {
      const id = r.followee_id as string;
      if (!excluded.has(id)) mutuals.set(id, (mutuals.get(id) ?? 0) + 1);
    }
  }

  // Shared rooms: who else was a member of the rooms I was in?
  const sharedRooms = new Map<string, number>();
  const roomIds = [...new Set((myRooms.data ?? []).map(r => r.room_id as string))];
  if (roomIds.length) {
    const { data, error } = await admin.from('room_memberships').select('user_id, room_id').in('room_id', roomIds).neq('user_id', u.id).limit(2000);
    if (error) fail(500, 'Could not load recommendations');
    const seen = new Set<string>();
    for (const r of data ?? []) {
      const id = r.user_id as string;
      const key = `${id}:${r.room_id}`;
      if (excluded.has(id) || seen.has(key)) continue;
      seen.add(key);
      sharedRooms.set(id, (sharedRooms.get(id) ?? 0) + 1);
    }
  }

  // Candidate pool: anyone with a signal, topped up with the newest members.
  const { data: newest, error: newestError } = await admin.from('profiles').select('id').neq('id', u.id).order('created_at', { ascending: false }).limit(40);
  if (newestError) fail(500, 'Could not load recommendations');
  const pool = [...new Set([
    ...[...followerIds].filter(id => !excluded.has(id)),
    ...mutuals.keys(),
    ...sharedRooms.keys(),
    ...(newest ?? []).map(r => r.id as string),
  ])].filter(id => !excluded.has(id)).slice(0, POOL);
  if (!pool.length) return { recommendations: [] };

  const [profiles, followCounts] = await Promise.all([
    admin.from('profiles').select('id, display_name, username, avatar_url, created_at').in('id', pool),
    admin.from('follows').select('followee_id').in('followee_id', pool).limit(5000),
  ]);
  if (profiles.error || followCounts.error) fail(500, 'Could not load recommendations');

  const counts = new Map<string, number>();
  for (const r of followCounts.data ?? []) counts.set(r.followee_id as string, (counts.get(r.followee_id as string) ?? 0) + 1);
  const byId = new Map((profiles.data ?? []).map(p => [p.id as string, p]));

  const candidates: Candidate[] = [...byId.values()].map(p => ({
    id: p.id,
    followsYou: followerIds.has(p.id),
    mutuals: mutuals.get(p.id) ?? 0,
    sharedRooms: sharedRooms.get(p.id) ?? 0,
    followers: counts.get(p.id) ?? 0,
    createdAt: p.created_at,
  }));

  return {
    recommendations: rankRecommendations(candidates, 8).map(r => {
      const p = byId.get(r.id)!;
      return { id: p.id, display_name: p.display_name, username: p.username, avatar_url: p.avatar_url, reason: r.reason, mutuals: r.mutuals };
    }),
  };
});
