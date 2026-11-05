import { admin } from '@/lib/supabase-admin';
import { route, requireUser, fail } from '@/lib/auth';

export const GET = route(async (req) => {
  const u = await requireUser(req);
  const { data, error } = await admin.from('room_invites').select('id, room_id, sender_id, created_at').eq('recipient_id', u.id).eq('status', 'pending').order('created_at', { ascending: false });
  if (error) fail(500, 'Could not load invitations');
  if (!data?.length) return { invitations: [] };
  const [rooms, senders, bans] = await Promise.all([
    admin.from('rooms').select('id, slug, title').in('id', [...new Set(data.map(i => i.room_id))]).eq('status', 'live'),
    admin.from('profiles').select('id, display_name, avatar_url').in('id', [...new Set(data.map(i => i.sender_id))]),
    admin.from('room_bans').select('room_id').eq('user_id', u.id).in('room_id', [...new Set(data.map(i => i.room_id))]),
  ]);
  if (rooms.error || senders.error || bans.error) fail(500, 'Could not load invitations');
  const roomMap = new Map((rooms.data ?? []).map(r => [r.id, r]));
  const senderMap = new Map((senders.data ?? []).map(p => [p.id, p]));
  const banned = new Set((bans.data ?? []).map(b => b.room_id));
  return { invitations: data.filter(i => roomMap.has(i.room_id) && !banned.has(i.room_id)).map(i => ({ id: i.id, created_at: i.created_at, room: roomMap.get(i.room_id), sender: senderMap.get(i.sender_id) })) };
});
