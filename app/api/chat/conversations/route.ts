import { admin } from '@/lib/supabase-admin';
import { route, requireUser, fail } from '@/lib/auth';
import { body, isUuid } from '@/lib/api';
import { dbFail, mutualFriendIds, mutualWith, NOT_MUTUAL, otherOf, personCards } from '@/lib/chat';
import { countUnread, pairOf, previewOf } from '@/lib/chat-core';

/** Your conversations, newest first, with a one-line preview and an unread count. */
export const GET = route(async (req) => {
  const u = await requireUser(req);
  const { data: convs, error } = await admin.from('conversations').select('*')
    .or(`user_a.eq.${u.id},user_b.eq.${u.id}`).not('last_message_id', 'is', null)
    .order('last_message_at', { ascending: false }).limit(100);
  if (error) dbFail(error, 'Could not load your chats');
  if (!convs?.length) return { conversations: [] };

  const ids = convs.map(c => c.id as string);
  const [last, reads, msgs, people, friends] = await Promise.all([
    admin.from('messages').select('id, conversation_id, sender_id, kind, body, call_kind, duration_ms, created_at').in('id', convs.map(c => c.last_message_id as string)),
    admin.from('conversation_reads').select('conversation_id, last_read_at').eq('user_id', u.id).in('conversation_id', ids),
    admin.from('messages').select('conversation_id, sender_id, created_at').in('conversation_id', ids).neq('sender_id', u.id).order('created_at', { ascending: false }).limit(1000),
    personCards(convs.map(c => otherOf(c, u.id))),
    mutualFriendIds(u.id),
  ]);
  if (last.error) dbFail(last.error, 'Could not load your chats');
  const lastById = new Map((last.data ?? []).map(m => [m.id as string, m]));
  const seen: Record<string, string> = {};
  for (const r of reads.data ?? []) seen[r.conversation_id] = r.last_read_at;
  const unread = countUnread(msgs.data ?? [], u.id, seen);
  const friendSet = new Set(friends);

  return {
    conversations: convs.flatMap(c => {
      const m = lastById.get(c.last_message_id as string);
      const otherId = otherOf(c, u.id);
      const person = people.get(otherId);
      if (!m || !person) return [];
      return [{
        id: c.id, person, unread: unread[c.id] ?? 0, canChat: friendSet.has(otherId),
        last: { preview: previewOf(m, u.id), at: m.created_at, mine: m.sender_id === u.id },
      }];
    }),
  };
});

/** Open (or create) your conversation with a friend. */
export const POST = route(async (req) => {
  const u = await requireUser(req);
  const b = await body(req);
  if (!isUuid(b.userId) || b.userId === u.id) fail(400, 'Choose someone to message');
  if (!(await mutualWith(u.id, b.userId))) fail(403, NOT_MUTUAL);
  const [a, c] = pairOf(u.id, b.userId);
  const find = () => admin.from('conversations').select('id').eq('user_a', a).eq('user_b', c).maybeSingle();
  const first = await find();
  if (first.error) dbFail(first.error, 'Could not open the chat');
  if (first.data) return { id: first.data.id };
  const made = await admin.from('conversations').insert({ user_a: a, user_b: c }).select('id').single();
  if (made.error?.code === '23505') { const again = await find(); if (again.data) return { id: again.data.id }; }
  if (made.error || !made.data) dbFail(made.error ?? {}, 'Could not open the chat');
  return { id: made.data.id };
});
