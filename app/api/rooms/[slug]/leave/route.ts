import { route, requireUser, fail } from '@/lib/auth';
import { getRoomBySlug, getRole, isBanned, logAction } from '@/lib/rooms';
import { leaveParticipant, listParticipants } from '@/lib/livekit';
import { reconcileRoom } from '@/lib/room-lifecycle';
import { body, endRoom, transferHost, isUuid } from '@/lib/api';

export const POST = route<{ params: Promise<{ slug: string }> }>(async (req, { params }) => {
  const { slug } = await params;
  const u = await requireUser(req);
  const room = await getRoomBySlug(slug);
  if (room.host_id !== u.id) fail(403, 'Only the host can use this');
  if (room.status === 'ended') return { ok: true, ended: true };
  const b = await body(req);
  if (b.mode === 'end') {
    await endRoom(room);
    await logAction(room.id, u.id, null, 'end');
    return { ok: true, ended: true };
  }
  if (b.mode === 'auto') {
    await leaveParticipant(room.slug, u.id);
    const result = await reconcileRoom(room, true);
    await logAction(room.id, u.id, null, 'leave_running');
    return { ok: true, ended: result.room.status === 'ended' };
  }
  if (b.mode !== 'transfer') fail(400, "mode must be 'auto', 'end' or 'transfer'");
  if (!isUuid(b.newHostId)) fail(400, 'newHostId is required for transfer');
  if (b.newHostId === u.id) fail(400, 'newHostId must be someone else');
  if (await isBanned(room.id, b.newHostId)) fail(400, 'User is banned from this room');
  if (!(await listParticipants(room.slug, true)).some(p => p.identity === b.newHostId)) fail(400, 'The new host must be connected to this room');
  if ((await getRole(room, b.newHostId, false)) === 'listener') {
    // allow listeners too, but the user must exist
    const { data } = await (await import('@/lib/supabase-admin')).admin.from('profiles').select('id').eq('id', b.newHostId).maybeSingle();
    if (!data) fail(404, 'User not found');
  }
  await transferHost(room, b.newHostId);
  await leaveParticipant(room.slug, u.id);
  await logAction(room.id, u.id, b.newHostId, 'transfer_host');
  return { ok: true, ended: false };
});
