import { admin } from '@/lib/supabase-admin';
import { route, requireUser, fail } from '@/lib/auth';
import { getRoomBySlug } from '@/lib/rooms';
import { body, namesFor } from '@/lib/api';

type Ctx = { params: Promise<{ slug: string }> };

export const GET = route<Ctx>(async (_req, { params }) => {
  const { slug } = await params;
  const room = await getRoomBySlug(slug);
  const names = await namesFor([room.host_id]);
  return { room, host_name: names[room.host_id] ?? 'User', status: room.status };
});

export const PATCH = route<Ctx>(async (req, { params }) => {
  const { slug } = await params;
  const u = await requireUser(req);
  const room = await getRoomBySlug(slug);
  if (room.host_id !== u.id) fail(403, 'Only the host can edit this room');
  const b = await body(req);
  const patch: Record<string, unknown> = {};
  if (b.title !== undefined) {
    if (typeof b.title !== 'string' || !b.title.trim() || b.title.length > 120) fail(400, 'title must be 1-120 characters');
    patch.title = b.title.trim();
  }
  for (const k of ['description', 'topic', 'language']) if (b[k] !== undefined) {
    if (typeof b[k] !== 'string') fail(400, `${k} must be a string`);
    patch[k] = b[k];
  }
  if (b.hands_enabled !== undefined) {
    if (typeof b.hands_enabled !== 'boolean') fail(400, 'hands_enabled must be a boolean');
    patch.hands_enabled = b.hands_enabled;
  }
  if (!Object.keys(patch).length) fail(400, 'Nothing to update');
  const { data, error } = await admin.from('rooms').update(patch).eq('id', room.id).select('*').single();
  if (error) fail(500, error.message);
  return { room: data };
});
