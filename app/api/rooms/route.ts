import { admin } from '@/lib/supabase-admin';
import { route, requireUser, fail } from '@/lib/auth';
import { makeSlug } from '@/lib/rooms';
import { reconcileRoom } from '@/lib/room-lifecycle';
import { body, namesFor } from '@/lib/api';
import { avatarUrl } from '@/lib/avatar';

export const GET = route(async () => {
  const { data } = await admin.from('rooms').select('*').eq('status', 'live').eq('visibility', 'public').order('created_at', { ascending: false });
  const reconciled = (await Promise.all((data ?? []).map(r => reconcileRoom(r)))).filter(r => r.room.status === 'live');
  const rooms = reconciled.map(r => r.room);
  const live = reconciled.map(r => r.participants);
  // Host first, then the other speakers, but only people who are connected right now.
  const speakerIds = rooms.map((r: any, i: number) => {
    const connected = new Set(live[i].map(p => p.identity));
    const ids = [r.host_id, ...reconciled[i].members.map(m => m.user_id)];
    return [...new Set(ids)].filter(id => connected.has(id)).slice(0, 4);
  });
  const people = [...new Set([...rooms.map((r: any) => r.host_id), ...speakerIds.flat()])];
  const names = await namesFor(people);
  const { data: profiles } = people.length ? await admin.from('profiles').select('id, avatar_url').in('id', people) : { data: [] };
  const photos = new Map((profiles ?? []).map(p => [p.id, avatarUrl(p.id, p.avatar_url)]));
  return {
    rooms: rooms.map((r: any, i: number) => ({
      slug: r.slug, title: r.title, topic: r.topic, language: r.language,
      host_name: names[r.host_id] ?? 'User', host_avatar_url: photos.get(r.host_id),
      audience: live[i].length,
      speakers: speakerIds[i].map((id: string) => ({ id, name: names[id] ?? 'User', avatar_url: photos.get(id) ?? null })),
    })),
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
