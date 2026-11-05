import { admin } from '@/lib/supabase-admin';
import { route, requireUser, fail } from '@/lib/auth';
import { body, isUuid, requireLive } from '@/lib/api';
import { getRoomBySlug } from '@/lib/rooms';

async function inviter(req: Parameters<typeof requireUser>[0], slug: string) {
  const u = await requireUser(req);
  const room = await getRoomBySlug(slug);
  requireLive(room);
  const [member, banned] = await Promise.all([
    admin.from('room_memberships').select('user_id').eq('room_id', room.id).eq('user_id', u.id).maybeSingle(),
    admin.from('room_bans').select('user_id').eq('room_id', room.id).eq('user_id', u.id).maybeSingle(),
  ]);
  if (member.error || banned.error) fail(500, 'Could not check room access');
  if (banned.data || (room.host_id !== u.id && !member.data)) fail(403, 'Join the room before inviting friends');
  return { u, room };
}
type Context = { params: Promise<{ slug: string }> };
export const GET = route<Context>(async (req, { params }) => {
  const { u, room } = await inviter(req, (await params).slug);
  const page = Number(req.nextUrl.searchParams.get('page') ?? '0');
  if (!Number.isInteger(page) || page < 0 || page > 10000) fail(400, 'Invalid page');
  const { data: follows, error } = await admin.from('follows').select('followee_id').eq('follower_id', u.id).order('followee_id').range(page * 50, page * 50 + 50);
  if (error) fail(500, 'Could not load friends');
  const ids = (follows ?? []).slice(0, 50).map(f => f.followee_id);
  if (!ids.length) return { friends: [], hasMore: false };
  const [profiles, invites, bans] = await Promise.all([
    admin.from('profiles').select('id, display_name, username, avatar_url').in('id', ids).order('display_name'),
    admin.from('room_invites').select('recipient_id').eq('room_id', room.id).in('recipient_id', ids),
    admin.from('room_bans').select('user_id').eq('room_id', room.id).in('user_id', ids),
  ]);
  if (profiles.error || invites.error || bans.error) fail(500, 'Could not load friends');
  const sent = new Set((invites.data ?? []).map(i => i.recipient_id));
  const banned = new Set((bans.data ?? []).map(b => b.user_id));
  return { friends: (profiles.data ?? []).filter(p => !banned.has(p.id)).map(p => ({ ...p, invited: sent.has(p.id) })), hasMore: (follows ?? []).length > 50 };
});
export const POST = route<Context>(async (req, { params }) => {
  const { u, room } = await inviter(req, (await params).slug);
  const { recipientId } = await body(req);
  if (!isUuid(recipientId) || recipientId === u.id) fail(400, 'Choose a friend to invite');
  const [friend, banned] = await Promise.all([
    admin.from('follows').select('followee_id').eq('follower_id', u.id).eq('followee_id', recipientId).maybeSingle(),
    admin.from('room_bans').select('user_id').eq('room_id', room.id).eq('user_id', recipientId).maybeSingle(),
  ]);
  if (friend.error || banned.error) fail(500, 'Could not check friend');
  if (!friend.data) fail(403, 'You can invite people you follow');
  if (banned.data) fail(403, 'This person cannot join this room');
  const { error } = await admin.from('room_invites').upsert({ room_id: room.id, sender_id: u.id, recipient_id: recipientId }, { onConflict: 'room_id,recipient_id', ignoreDuplicates: true });
  if (error) fail(500, 'Could not send invitation');
  return { ok: true };
});
