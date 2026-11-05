import { admin } from '@/lib/supabase-admin';
import { route, requireUser } from '@/lib/auth';
import { dbFail, loadConversation } from '@/lib/chat';

/** Mark everything in this conversation as read, up to now. */
export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const u = await requireUser(req);
  const conv = await loadConversation((await params).id, u.id);
  const { error } = await admin.from('conversation_reads').upsert({ conversation_id: conv.id, user_id: u.id, last_read_at: new Date().toISOString() });
  if (error) dbFail(error, 'Could not mark as read');
  return { ok: true };
});
