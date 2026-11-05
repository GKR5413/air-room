import { admin } from './supabase-admin';
import { fail } from './auth';
import { setParticipantRole } from './livekit';
import { decideSuccession, type Speaker } from './succession';
import type { Role, RoomRow } from './types';

export async function getRoomBySlug(slug: string): Promise<RoomRow> {
  const { data } = await admin.from('rooms').select('*').eq('slug', slug).maybeSingle();
  return (data as RoomRow | null) ?? fail(404, 'Room not found');
}

/** Durable role from DB. Guests are always listeners. */
export async function getRole(room: RoomRow, userId: string, isGuest: boolean): Promise<Role> {
  if (isGuest) return 'listener';
  if (room.host_id === userId) return 'host';
  const { data } = await admin.from('room_memberships').select('role').eq('room_id', room.id).eq('user_id', userId).maybeSingle();
  return ((data?.role as Role) ?? 'listener');
}

export const isMod = (r: Role) => r === 'host' || r === 'moderator';

export async function isBanned(roomId: string, userId: string) {
  const { data } = await admin.from('room_bans').select('user_id').eq('room_id', roomId).eq('user_id', userId).maybeSingle();
  return !!data;
}

export async function setRole(roomId: string, userId: string, role: Role) {
  const { error } = await admin.from('room_memberships').upsert({ room_id: roomId, user_id: userId, role, updated_at: new Date().toISOString() });
  if (error) fail(500, 'Could not save room role');
}

/** actorId is null for actions taken by the system itself (e.g. automatic succession). */
export async function logAction(roomId: string, actorId: string | null, targetId: string | null, action: string) {
  await admin.from('moderation_actions').insert({ room_id: roomId, actor_id: actorId, target_id: targetId, action });
}

/**
 * Keep the room moderated. Called from the state poll with who is connected right now.
 * If no host/moderator is connected, the speaker who has held
 * the stage longest becomes a moderator. Returns that user's id when a promotion happened.
 *
 * Many people poll at once, so the promotion is claimed with a compare-and-swap on
 * `leader_seen_at`: exactly one request wins and promotes exactly one speaker.
 * Needs migrations 0003 and 0006. A failed promotion claim is reported to the caller.
 */
export async function ensureModerator(room: RoomRow, leaderOnline: boolean, speakers: Speaker[]): Promise<string | null> {
  const now = Date.now();
  const stamp = new Date(now).toISOString();
  const d = decideSuccession({ now, seenAt: room.leader_seen_at, leaderOnline, speakers });
  if (d.kind === 'touch') {
    const { error } = await admin.from('rooms').update({ leader_seen_at: stamp }).eq('id', room.id).eq('status', 'live');
    if (error) fail(500, 'Could not update room presence');
    return null;
  }
  if (d.kind !== 'promote') return null;
  const { data: claimed, error } = await admin.rpc('claim_room_moderator', {
    p_room_id: room.id, p_user_id: d.id, p_seen_at: room.leader_seen_at ?? null,
  });
  if (error) fail(500, 'Could not assign moderator');
  if (!claimed) return null;
  await setParticipantRole(room.slug, d.id, 'moderator');
  await logAction(room.id, null, d.id, 'auto_promote_mod');
  return d.id;
}

export const makeSlug = () => Math.random().toString(36).slice(2, 10);
