import { admin } from './supabase-admin';
import { fail } from './auth';
import { isUuid } from './api';
import { avatarUrl } from './avatar';
import { callRoomName, closeRoom } from './livekit';
import { isMutual, nextCallStep, expiryStep, type CallAction, type CallKind, type CallOutcome, type CallRow } from './chat-core';

export interface ChatPerson { id: string; name: string; username: string | null; avatar_url: string | null }
export interface ConversationRow { id: string; user_a: string; user_b: string; last_message_id: string | null; last_message_at: string }
export interface CallFull extends CallRow { conversation_id: string }
export interface MessageRow {
  id: string; sender_id: string; kind: 'text' | 'voice' | 'call'; body: string;
  duration_ms: number | null; call_kind: CallKind | null; created_at: string;
}
export const MESSAGE_COLUMNS = 'id, sender_id, kind, body, duration_ms, call_kind, created_at';

export const NEEDS_SETUP = 'Chat isn’t set up yet. The database update 0007_chat.sql still needs to be applied.';

/** Turn a database error into an HTTP error, with a clear message while the chat tables don't exist yet. */
export function dbFail(error: { code?: string; message?: string }, fallback: string): never {
  if (error.code === 'PGRST205' || error.code === '42P01' || /does not exist|schema cache/i.test(error.message ?? '')) fail(503, NEEDS_SETUP);
  fail(500, fallback);
  throw new Error(fallback);
}

/** True only when both people follow each other. */
export async function mutualWith(a: string, b: string): Promise<boolean> {
  if (!isUuid(a) || !isUuid(b)) return false;
  const { data, error } = await admin.from('follows').select('follower_id, followee_id')
    .or(`and(follower_id.eq.${a},followee_id.eq.${b}),and(follower_id.eq.${b},followee_id.eq.${a})`);
  if (error) fail(500, 'Could not check your connection');
  return isMutual(data ?? [], a, b);
}

export const NOT_MUTUAL = 'You can message each other once you both follow each other';

/** Everyone you follow who also follows you. */
export async function mutualFriendIds(me: string): Promise<string[]> {
  const [followers, following] = await Promise.all([
    admin.from('follows').select('follower_id').eq('followee_id', me),
    admin.from('follows').select('followee_id').eq('follower_id', me),
  ]);
  if (followers.error || following.error) fail(500, 'Could not load your connections');
  const theirs = new Set((followers.data ?? []).map(r => r.follower_id as string));
  return (following.data ?? []).map(r => r.followee_id as string).filter(id => theirs.has(id));
}

export async function personCards(ids: string[]): Promise<Map<string, ChatPerson>> {
  const out = new Map<string, ChatPerson>();
  if (!ids.length) return out;
  const { data, error } = await admin.from('profiles').select('id, display_name, username, avatar_url').in('id', [...new Set(ids)]);
  if (error) fail(500, 'Could not load people');
  for (const p of data ?? []) out.set(p.id, { id: p.id, name: p.display_name ?? 'User', username: p.username ?? null, avatar_url: avatarUrl(p.id, p.avatar_url) });
  return out;
}

export const otherOf = (c: { user_a: string; user_b: string }, me: string) => (c.user_a === me ? c.user_b : c.user_a);

/** A conversation you are part of. Anyone else gets "not found" so ids can't be probed. */
export async function loadConversation(id: string, userId: string): Promise<ConversationRow> {
  if (!isUuid(id)) fail(404, 'Conversation not found');
  const { data, error } = await admin.from('conversations').select('*').eq('id', id).maybeSingle();
  if (error) dbFail(error, 'Could not load the conversation');
  if (!data || (data.user_a !== userId && data.user_b !== userId)) fail(404, 'Conversation not found');
  return data as ConversationRow;
}

export async function insertMessage(
  c: ConversationRow, senderId: string,
  m: { kind: 'text' | 'voice' | 'call'; body?: string; audio?: string; duration_ms?: number | null; call_kind?: CallKind | null },
): Promise<MessageRow> {
  const { data, error } = await admin.from('messages').insert({
    conversation_id: c.id, sender_id: senderId, kind: m.kind, body: m.body ?? '',
    audio: m.audio ?? null, duration_ms: m.duration_ms ?? null, call_kind: m.call_kind ?? null,
  }).select(MESSAGE_COLUMNS).single();
  if (error || !data) dbFail(error ?? {}, 'Could not send the message');
  await admin.from('conversations').update({ last_message_id: data.id, last_message_at: data.created_at }).eq('id', c.id);
  return data as MessageRow;
}

/* ── Calls ───────────────────────────────────────────────── */

export async function loadCall(id: string): Promise<CallFull> {
  if (!isUuid(id)) fail(404, 'Call not found');
  const { data, error } = await admin.from('calls').select('*').eq('id', id).maybeSingle();
  if (error) dbFail(error, 'Could not load the call');
  if (!data) fail(404, 'Call not found');
  return data as CallFull;
}

export function requireParticipant(call: CallFull, userId: string) {
  if (call.caller_id !== userId && call.callee_id !== userId) fail(404, 'Call not found');
}

const TERMINAL = ['declined', 'canceled', 'missed', 'ended'];

/**
 * Apply an action to a call (or its natural timeout) and record how it ended in the chat.
 * The status change is a compare-and-swap, so two people acting at the same moment cannot both win.
 */
export async function applyCallAction(call: CallFull, action: CallAction, actorId: string): Promise<CallFull> {
  const now = Date.now();
  const step = nextCallStep(call, action, actorId, now);
  if (!step.ok) return fail(step.status, step.error);

  const stamp = new Date(now).toISOString();
  const patch: Record<string, unknown> = {};
  if (step.to) {
    patch.status = step.to;
    if (step.to === 'accepted') { patch.answered_at = stamp; patch.last_ping_at = stamp; }
    if (TERMINAL.includes(step.to)) patch.ended_at = stamp;
  } else if (action === 'ping' && call.status === 'accepted') {
    patch.last_ping_at = stamp;
  }
  if (!Object.keys(patch).length) return call;

  const { data, error } = await admin.from('calls').update(patch).eq('id', call.id).eq('status', call.status).select('*').maybeSingle();
  if (error) dbFail(error, 'Could not update the call');
  if (!data) return loadCall(call.id); // someone else changed it first: report what happened

  if (step.outcome) {
    const { data: conv } = await admin.from('conversations').select('*').eq('id', call.conversation_id).maybeSingle();
    if (conv) await insertMessage(conv as ConversationRow, call.caller_id, { kind: 'call', body: step.outcome as CallOutcome, call_kind: call.kind, duration_ms: step.durationMs ?? null });
  }
  if (step.to && TERMINAL.includes(step.to)) await closeRoom(callRoomName(call.id));
  return data as CallFull;
}

/** Close out calls whose time ran out, then say whether this one is still alive. */
export async function settleCall(call: CallFull): Promise<CallFull> {
  return expiryStep(call, Date.now()) ? applyCallAction(call, 'ping', call.caller_id) : call;
}

export async function callView(call: CallFull, me: string) {
  const otherId = call.caller_id === me ? call.callee_id : call.caller_id;
  const people = await personCards([otherId]);
  return {
    id: call.id, kind: call.kind, status: call.status, conversation_id: call.conversation_id,
    role: call.caller_id === me ? 'caller' as const : 'callee' as const,
    created_at: call.created_at, answered_at: call.answered_at,
    person: people.get(otherId) ?? { id: otherId, name: 'User', username: null, avatar_url: null },
  };
}

/** Any ringing or connected call this person is in (expired ones are closed on the way). */
export async function openCallsFor(userId: string): Promise<CallFull[]> {
  const { data, error } = await admin.from('calls').select('*').in('status', ['ringing', 'accepted'])
    .or(`caller_id.eq.${userId},callee_id.eq.${userId}`).order('created_at', { ascending: false }).limit(10);
  if (error) dbFail(error, 'Could not load calls');
  const open: CallFull[] = [];
  for (const raw of (data ?? []) as CallFull[]) {
    const settled = await settleCall(raw);
    if (settled.status === 'ringing' || settled.status === 'accepted') open.push(settled);
  }
  return open;
}
