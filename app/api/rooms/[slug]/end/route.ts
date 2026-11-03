import { route, requireUser, fail } from '@/lib/auth';
import { getRoomBySlug, logAction } from '@/lib/rooms';
import { endRoom } from '@/lib/api';

export const POST = route<{ params: Promise<{ slug: string }> }>(async (req, { params }) => {
  const { slug } = await params;
  const u = await requireUser(req);
  const room = await getRoomBySlug(slug);
  if (room.host_id !== u.id) fail(403, 'Only the host can end the room');
  if (room.status === 'ended') return { ok: true };
  await endRoom(room);
  await logAction(room.id, u.id, null, 'end');
  return { ok: true };
});
