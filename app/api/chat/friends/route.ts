import { admin } from '@/lib/supabase-admin';
import { route, requireUser } from '@/lib/auth';
import { dbFail, mutualFriendIds, personCards } from '@/lib/chat';
import { pairOf } from '@/lib/chat-core';

/** People you follow who follow you back: the only people you can chat with. */
export const GET = route(async (req) => {
  const u = await requireUser(req);
  const ids = (await mutualFriendIds(u.id)).slice(0, 300);
  if (!ids.length) return { friends: [] };
  const [people, convs] = await Promise.all([
    personCards(ids),
    admin.from('conversations').select('id, user_a, user_b').or(`user_a.eq.${u.id},user_b.eq.${u.id}`),
  ]);
  // Before migration 0007 there is no conversations table: friends still show, they just have no chat yet.
  if (convs.error && convs.error.code !== 'PGRST205' && convs.error.code !== '42P01') dbFail(convs.error, 'Could not load chats');
  const byFriend = new Map<string, string>();
  for (const c of convs.data ?? []) byFriend.set(c.user_a === u.id ? c.user_b : c.user_a, c.id);
  const friends = ids.flatMap(id => people.get(id) ? [{ ...people.get(id)!, conversationId: byFriend.get(id) ?? null }] : []);
  friends.sort((a, b) => a.name.localeCompare(b.name));
  void pairOf;
  return { friends };
});
