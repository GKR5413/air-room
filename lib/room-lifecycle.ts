import { admin } from './supabase-admin';
import { fail } from './auth';
import { endRoom } from './api';
import { listParticipants } from './livekit';
import { ensureModerator, logAction } from './rooms';
import type { Role, RoomRow } from './types';

type Member = { user_id: string; role: Role; updated_at: string };

/** LiveKit connectivity + durable roles determine whether a panel still exists. */
export async function reconcileRoom(room: RoomRow, panelJustLeft = false) {
  const [participants, membership] = await Promise.all([
    room.status === 'live' ? listParticipants(room.slug, true) : Promise.resolve([]),
    admin.from('room_memberships').select('user_id, role, updated_at').eq('room_id', room.id).neq('role', 'listener'),
  ]);
  if (membership.error) fail(500, 'Could not load stage roles');
  const members = (membership.data ?? []) as Member[];
  let promoted: string | null = null;
  if (room.status === 'live') {
    const connected = new Set(participants.map(p => p.identity));
    const leaderOnline = connected.has(room.host_id) || members.some(m => m.role === 'moderator' && connected.has(m.user_id));
    const speakers = members.filter(m => m.role === 'speaker' && connected.has(m.user_id)).map(m => ({ id: m.user_id, since: m.updated_at }));
    // A newly-created room must survive its lobby and initial connection. The
    // first observed leader marks it started; a confirmed panel departure also
    // counts, even if the host left before the first state refresh.
    if (!leaderOnline && !speakers.length && (room.leader_seen_at || panelJustLeft)) {
      await endRoom(room);
      room = { ...room, status: 'ended' };
      await logAction(room.id, null, null, 'auto_end_empty_panel');
    } else {
      promoted = await ensureModerator(room, leaderOnline, speakers);
    }
  }
  return { room, participants: room.status === 'ended' ? [] : participants, members, promoted };
}
