import type { NextRequest } from 'next/server';
import { admin } from './supabase-admin';
import { fail } from './auth';
import { closeRoom, setParticipantRole } from './livekit';
import { setRole } from './rooms';
import type { RoomRow } from './types';

export async function body(req: NextRequest): Promise<Record<string, any>> {
  const b = await req.json().catch(() => null);
  return b && typeof b === 'object' ? b : fail(400, 'Request body must be a JSON object');
}

export const isGuestId = (id: string) => id.startsWith('guest-');
export const isUuid = (s: unknown): s is string =>
  typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

export async function namesFor(ids: string[]): Promise<Record<string, string>> {
  if (!ids.length) return {};
  const { data } = await admin.from('profiles').select('id, display_name').in('id', ids);
  return Object.fromEntries((data ?? []).map((p: any) => [p.id, p.display_name]));
}

export const requireLive = (room: RoomRow) => {
  if (room.status === 'ended') fail(410, 'This room has ended');
};

export async function endRoom(room: RoomRow) {
  await admin.from('rooms').update({ status: 'ended', ended_at: new Date().toISOString() }).eq('id', room.id);
  await admin.from('stage_invitations').update({ status: 'revoked' }).eq('room_id', room.id).eq('status', 'pending');
  await admin.from('hand_requests').update({ status: 'withdrawn' }).eq('room_id', room.id).eq('status', 'pending');
  await closeRoom(room.slug);
}

/** Make newHostId the host; the old host becomes a moderator. */
export async function transferHost(room: RoomRow, newHostId: string) {
  await admin.from('rooms').update({ host_id: newHostId }).eq('id', room.id);
  await setRole(room.id, newHostId, 'host');
  await setRole(room.id, room.host_id, 'moderator');
  await setParticipantRole(room.slug, newHostId, 'host');
  await setParticipantRole(room.slug, room.host_id, 'moderator');
}
