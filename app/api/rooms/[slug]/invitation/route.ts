import { admin } from '@/lib/supabase-admin';
import { route, requireUser, fail } from '@/lib/auth';
import { getRoomBySlug, getRole, isBanned, setRole } from '@/lib/rooms';
import { setParticipantRole } from '@/lib/livekit';
import { body, requireLive } from '@/lib/api';

export const POST = route<{ params: Promise<{ slug: string }> }>(async (req, { params }) => {
  const { slug } = await params;
  const u = await requireUser(req);
  const room = await getRoomBySlug(slug);
  const b = await body(req);
  if (b.action !== 'accept' && b.action !== 'decline') fail(400, "action must be 'accept' or 'decline'");
  if (typeof b.id !== 'string') fail(400, 'id is required');
  const { data: inv } = await admin.from('stage_invitations').select('*').eq('id', b.id).eq('room_id', room.id).eq('user_id', u.id).maybeSingle();
  if (!inv) fail(404, 'Invitation not found');
  if (inv.status !== 'pending') fail(409, `Invitation is no longer pending (${inv.status})`);
  if (b.action === 'decline') {
    await admin.from('stage_invitations').update({ status: 'declined' }).eq('id', inv.id);
    return { ok: true };
  }
  requireLive(room);
  if (await isBanned(room.id, u.id)) fail(403, 'You have been removed from this room');
  const current = await getRole(room, u.id, false);
  const role = current === 'listener' ? 'speaker' : current;
  await admin.from('stage_invitations').update({ status: 'accepted' }).eq('id', inv.id);
  await admin.from('hand_requests').update({ status: 'invited' }).eq('room_id', room.id).eq('user_id', u.id).eq('status', 'pending');
  await setRole(room.id, u.id, role);
  await setParticipantRole(room.slug, u.id, role);
  return { ok: true, role }; // client should re-call join for a fresh token
});
