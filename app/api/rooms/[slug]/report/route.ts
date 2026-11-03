import { admin } from '@/lib/supabase-admin';
import { route, requireUser, fail } from '@/lib/auth';
import { getRoomBySlug } from '@/lib/rooms';
import { body, isUuid } from '@/lib/api';

export const POST = route<{ params: Promise<{ slug: string }> }>(async (req, { params }) => {
  const { slug } = await params;
  const u = await requireUser(req);
  const room = await getRoomBySlug(slug);
  const b = await body(req);
  const reason = typeof b.reason === 'string' ? b.reason.trim() : '';
  if (!reason) fail(400, 'reason is required');
  if (b.details != null && typeof b.details !== 'string') fail(400, 'details must be a string');
  if (b.targetUserId != null && !isUuid(b.targetUserId)) fail(400, 'targetUserId must be a user id');
  const { error } = await admin.from('reports').insert({
    reporter_id: u.id, room_id: room.id, target_user_id: b.targetUserId ?? null, reason, details: b.details ?? '',
  });
  if (error) fail(error.code === '23503' ? 404 : 500, error.code === '23503' ? 'Reported user not found' : error.message);
  return { ok: true };
});
