import { admin } from './supabase-admin';
import { fail } from './auth';
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

export async function logAction(roomId: string, actorId: string, targetId: string | null, action: string) {
  await admin.from('moderation_actions').insert({ room_id: roomId, actor_id: actorId, target_id: targetId, action });
}

export const makeSlug = () => Math.random().toString(36).slice(2, 10);
