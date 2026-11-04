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
  await admin.from('room_memberships').upsert({ room_id: roomId, user_id: userId, role, updated_at: new Date().toISOString() });
}

/** actorId is null for actions taken by the system itself (e.g. automatic succession). */
export async function logAction(roomId: string, actorId: string | null, targetId: string | null, action: string) {
  await admin.from('moderation_actions').insert({ room_id: roomId, actor_id: actorId, target_id: targetId, action });
}

/**
 * Keep the room moderated. Called from the state poll with who is connected right now.
 * If no host/moderator has been connected for LEADER_GRACE_MS, the speaker who has held
 * the stage longest becomes a moderator. Returns that user's id when a promotion happened.
 *
 * Many people poll at once, so the promotion is claimed with a compare-and-swap on
 * `leader_seen_at`: exactly one request wins and promotes exactly one speaker.
 * Needs migration 0003; without it every write below fails quietly and this is a no-op.
 */
export async function ensureModerator(room: RoomRow, leaderOnline: boolean, speakers: Speaker[]): Promise<string | null> {
  const now = Date.now();
  const stamp = new Date(now).toISOString();
  const d = decideSuccession({ now, seenAt: room.leader_seen_at, leaderOnline, speakers });
  if (d.kind === 'touch') {
    await admin.from('rooms').update({ leader_seen_at: stamp }).eq('id', room.id);
    return null;
  }
  if (d.kind === 'start') {
    await admin.from('rooms').update({ leader_seen_at: stamp }).eq('id', room.id).is('leader_seen_at', null);
    return null;
  }
  if (d.kind !== 'promote') return null;
  const { data } = await admin.from('rooms').update({ leader_seen_at: stamp })
    .eq('id', room.id).eq('leader_seen_at', room.leader_seen_at as string).select('id');
  if (!data?.length) return null; // another request already claimed this promotion
  await setRole(room.id, d.id, 'moderator');
  await setParticipantRole(room.slug, d.id, 'moderator');
  await logAction(room.id, null, d.id, 'auto_promote_mod');
  return d.id;
}

export const makeSlug = () => Math.random().toString(36).slice(2, 10);
