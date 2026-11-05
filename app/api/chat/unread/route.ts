import { admin } from '@/lib/supabase-admin';
import { route, requireUser } from '@/lib/auth';
import { dbFail } from '@/lib/chat';
import { countUnread } from '@/lib/chat-core';

/** How many unread messages you have in total (for the badge on the Messages tab). */
export const GET = route(async (req) => {
  const u = await requireUser(req);
  const { data: convs, error } = await admin.from('conversations').select('id').or(`user_a.eq.${u.id},user_b.eq.${u.id}`).not('last_message_id', 'is', null);
  if (error) { if (error.code === 'PGRST205' || error.code === '42P01') return { count: 0 }; dbFail(error, 'Could not load chats'); }
  const ids = (convs ?? []).map(c => c.id as string);
  if (!ids.length) return { count: 0 };
  const [reads, msgs] = await Promise.all([
    admin.from('conversation_reads').select('conversation_id, last_read_at').eq('user_id', u.id).in('conversation_id', ids),
    admin.from('messages').select('conversation_id, sender_id, created_at').in('conversation_id', ids).neq('sender_id', u.id).order('created_at', { ascending: false }).limit(1000),
  ]);
  const seen: Record<string, string> = {};
  for (const r of reads.data ?? []) seen[r.conversation_id] = r.last_read_at;
  const per = countUnread(msgs.data ?? [], u.id, seen);
  return { count: Object.values(per).reduce((n, x) => n + x, 0) };
});
