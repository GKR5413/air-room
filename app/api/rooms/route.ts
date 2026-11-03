import { admin } from '@/lib/supabase-admin';
import { route, requireUser, fail } from '@/lib/auth';
import { makeSlug } from '@/lib/rooms';
import { listParticipants } from '@/lib/livekit';
import { body, namesFor } from '@/lib/api';

export const GET = route(async () => {
  const { data } = await admin.from('rooms').select('*').eq('status', 'live').eq('visibility', 'public').order('created_at', { ascending: false });
  const rooms = data ?? [];
  const names = await namesFor([...new Set(rooms.map((r: any) => r.host_id))]);
  return {
    rooms: await Promise.all(rooms.map(async (r: any) => ({
      slug: r.slug, title: r.title, topic: r.topic, language: r.language,
      host_name: names[r.host_id] ?? 'User',
      audience: (await listParticipants(r.slug)).length,
    }))),
  };
});

export const POST = route(async (req) => {
  const u = await requireUser(req);
  const b = await body(req);
  const title = typeof b.title === 'string' ? b.title.trim() : '';
  if (!title) fail(400, 'title is required');
  if (title.length > 120) fail(400, 'title must be at most 120 characters');
  const visibility = b.visibility ?? 'public';
  if (visibility !== 'public' && visibility !== 'unlisted') fail(400, "visibility must be 'public' or 'unlisted'");
  for (const k of ['description', 'topic', 'language']) if (b[k] != null && typeof b[k] !== 'string') fail(400, `${k} must be a string`);
  if (b.hands_enabled != null && typeof b.hands_enabled !== 'boolean') fail(400, 'hands_enabled must be a boolean');
  let room: any = null;
  for (let i = 0; i < 5 && !room; i++) {
    const { data, error } = await admin.from('rooms').insert({
      slug: makeSlug(), host_id: u.id, title, description: b.description ?? '', topic: b.topic ?? '',
      language: b.language || 'en', visibility, status: 'live', hands_enabled: b.hands_enabled ?? true,
    }).select('*').single();
    if (data) room = data; else if (error?.code !== '23505') fail(500, error?.message ?? 'Could not create room');
  }
  if (!room) fail(500, 'Could not allocate a room slug, try again');
  await admin.from('room_memberships').upsert({ room_id: room.id, user_id: u.id, role: 'host', updated_at: new Date().toISOString() });
  return { slug: room.slug };
});
