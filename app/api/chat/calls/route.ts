import { admin } from '@/lib/supabase-admin';
import { route, requireUser, fail } from '@/lib/auth';
import { body } from '@/lib/api';
import { callView, dbFail, loadConversation, mutualWith, NOT_MUTUAL, openCallsFor, otherOf } from '@/lib/chat';

/** Start calling a friend. */
export const POST = route(async (req) => {
  const u = await requireUser(req);
  const b = await body(req);
  if (b.kind !== 'audio' && b.kind !== 'video') fail(400, 'Choose an audio or video call');
  const conv = await loadConversation(String(b.conversationId ?? ''), u.id);
  const calleeId = otherOf(conv, u.id);
  if (!(await mutualWith(u.id, calleeId))) fail(403, NOT_MUTUAL);

  // One call at a time, for both of you.
  const [mine, theirs] = await Promise.all([openCallsFor(u.id), openCallsFor(calleeId)]);
  if (mine.length) fail(409, 'You’re already in a call');
  if (theirs.length) fail(409, 'They’re on another call right now');

  const { data, error } = await admin.from('calls').insert({ conversation_id: conv.id, caller_id: u.id, callee_id: calleeId, kind: b.kind }).select('*').single();
  if (error || !data) dbFail(error ?? {}, 'Could not start the call');
  return { call: await callView(data, u.id) };
});

/** What this person should see right now: a call ringing for them, or one they are in. */
export const GET = route(async (req) => {
  const u = await requireUser(req);
  const open = await openCallsFor(u.id);
  const incoming = open.find(c => c.status === 'ringing' && c.callee_id === u.id);
  const active = open.find(c => c.status === 'accepted') ?? open.find(c => c.status === 'ringing' && c.caller_id === u.id);
  return {
    incoming: incoming ? await callView(incoming, u.id) : null,
    active: active ? await callView(active, u.id) : null,
  };
});
