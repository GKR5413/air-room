import { admin } from '@/lib/supabase-admin';
import { route, requireUser, fail } from '@/lib/auth';
import { body, isUuid } from '@/lib/api';

export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const u = await requireUser(req);
  const { id } = await params;
  const { action } = await body(req);
  if (!isUuid(id) || !['accept', 'dismiss'].includes(action)) fail(400, 'Invalid invitation action');
  const { data: invite, error } = await admin.from('room_invites').select('room_id').eq('id', id).eq('recipient_id', u.id).eq('status', 'pending').maybeSingle();
  if (error) fail(500, 'Could not load invitation');
  if (!invite) return fail(404, 'Invitation not found');
  let slug: string | undefined;
  if (action === 'accept') {
    const [room, ban] = await Promise.all([
      admin.from('rooms').select('slug, status').eq('id', invite.room_id).single(),
      admin.from('room_bans').select('user_id').eq('room_id', invite.room_id).eq('user_id', u.id).maybeSingle(),
    ]);
    if (room.error || ban.error) fail(500, 'Could not check room');
    if (!room.data || room.data.status !== 'live') return fail(410, 'This room has ended');
    if (ban.data) fail(403, 'You cannot join this room');
    slug = room.data.slug;
  }
  const result = await admin.from('room_invites').update({ status: action === 'accept' ? 'accepted' : 'dismissed' }).eq('id', id).eq('recipient_id', u.id).eq('status', 'pending').select('id');
  if (result.error) fail(500, 'Could not update invitation');
  if (!result.data?.length) fail(409, 'This invitation has already been handled');
  return { ok: true, slug };
});
