import { admin } from '@/lib/supabase-admin';
import { route, requireUser, fail } from '@/lib/auth';
import { body } from '@/lib/api';
import { dbFail, insertMessage, loadConversation, MESSAGE_COLUMNS, mutualWith, NOT_MUTUAL, otherOf, personCards } from '@/lib/chat';
import { checkText, checkVoice } from '@/lib/chat-core';

type Ctx = { params: Promise<{ id: string }> };
const PAGE = 40;

/** A page of messages (oldest first). Pass ?before=<time> to load earlier ones. */
export const GET = route<Ctx>(async (req, { params }) => {
  const u = await requireUser(req);
  const conv = await loadConversation((await params).id, u.id);
  const otherId = otherOf(conv, u.id);
  const before = req.nextUrl.searchParams.get('before');
  if (before && Number.isNaN(Date.parse(before))) fail(400, 'Invalid time');

  let q = admin.from('messages').select(MESSAGE_COLUMNS).eq('conversation_id', conv.id).order('created_at', { ascending: false }).limit(PAGE + 1);
  if (before) q = q.lt('created_at', before);
  const [page, people, theirRead, mutual] = await Promise.all([
    q,
    personCards([otherId]),
    admin.from('conversation_reads').select('last_read_at').eq('conversation_id', conv.id).eq('user_id', otherId).maybeSingle(),
    mutualWith(u.id, otherId),
  ]);
  if (page.error) dbFail(page.error, 'Could not load messages');
  const rows = page.data ?? [];
  return {
    person: people.get(otherId) ?? { id: otherId, name: 'User', username: null, avatar_url: null },
    canChat: mutual,
    hasMore: rows.length > PAGE,
    otherReadAt: theirRead.data?.last_read_at ?? null,
    messages: rows.slice(0, PAGE).reverse(),
  };
});

/** Send a text message or a recorded voice message. */
export const POST = route<Ctx>(async (req, { params }) => {
  const u = await requireUser(req);
  const conv = await loadConversation((await params).id, u.id);
  if (!(await mutualWith(u.id, otherOf(conv, u.id)))) fail(403, NOT_MUTUAL);
  const b = await body(req);

  if (b.kind === 'voice') {
    const v = checkVoice(b.audio, b.duration_ms);
    if (!v.ok) return fail(400, v.error);
    return { message: await insertMessage(conv, u.id, { kind: 'voice', audio: v.value.dataUrl, duration_ms: v.value.durationMs }) };
  }
  const t = checkText(b.body);
  if (!t.ok) return fail(400, t.error);
  return { message: await insertMessage(conv, u.id, { kind: 'text', body: t.value }) };
});
