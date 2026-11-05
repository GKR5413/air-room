import { route, getIdentity, fail } from '@/lib/auth';
import { body } from '@/lib/api';
import { getRoomBySlug, getRole } from '@/lib/rooms';
import { leaveParticipant } from '@/lib/livekit';
import { reconcileRoom } from '@/lib/room-lifecycle';

/** Explicit leave, room switching and pagehide all use the same server cleanup. */
export const POST = route<{ params: Promise<{ slug: string }> }>(async (req, { params }) => {
  const { identity } = await getIdentity(req);
  const room = await getRoomBySlug((await params).slug);
  if (room.status === 'ended') return { ok: true, ended: true };
  const { participantSid } = await body(req);
  if (typeof participantSid !== 'string' || !participantSid || participantSid.length > 128) fail(400, 'participantSid is required');
  const role = await getRole(room, identity.id, identity.isGuest);
  await leaveParticipant(room.slug, identity.id, participantSid);
  // The browser may have disconnected before the keepalive request arrived.
  // A stale SID never removes a new connection, which reconciliation will see.
  const result = await reconcileRoom(room, role !== 'listener');
  return { ok: true, ended: result.room.status === 'ended' };
});
