import { admin } from '@/lib/supabase-admin';
import { route, requireUser, fail } from '@/lib/auth';
import { getRoomBySlug, getRole, isBanned } from '@/lib/rooms';
import { body, requireLive } from '@/lib/api';

export const POST = route<{ params: Promise<{ slug: string }> }>(async (req, { params }) => {
  const { slug } = await params;
  const u = await requireUser(req);
  const room = await getRoomBySlug(slug);
  const b = await body(req);
  if (b.action === 'lower') {
    await admin.from('hand_requests').update({ status: 'withdrawn' }).eq('room_id', room.id).eq('user_id', u.id).eq('status', 'pending');
    return { ok: true };
  }
  if (b.action !== 'raise') fail(400, "action must be 'raise' or 'lower'");
  requireLive(room);
  if (!room.hands_enabled) fail(403, 'Raising hands is currently disabled in this room');
  if (await isBanned(room.id, u.id)) fail(403, 'You have been removed from this room');
  if ((await getRole(room, u.id, false)) !== 'listener') fail(400, 'You are already on stage');
  const { error } = await admin.from('hand_requests').insert({ room_id: room.id, user_id: u.id });
  if (error && error.code !== '23505') fail(500, error.message); // 23505: already pending
  return { ok: true };
});
