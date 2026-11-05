/**
 * Chat rules that need no database: who may do what to a call, how long things last, what a
 * conversation preview says. Kept dependency-free so it is easy to test.
 */

export type CallStatus = 'ringing' | 'accepted' | 'declined' | 'canceled' | 'missed' | 'ended';
export type CallKind = 'audio' | 'video';
export type CallOutcome = 'completed' | 'missed' | 'declined' | 'canceled';
export type CallAction = 'accept' | 'decline' | 'cancel' | 'end' | 'ping';

/** How long a call rings before it counts as missed. */
export const RING_MS = 45_000;
/** A connected call with no heartbeat for this long is considered over (a tab was closed, a phone died). */
export const STALE_MS = 45_000;
export const MAX_TEXT = 2000;
export const MAX_VOICE_MS = 180_000;
export const MAX_VOICE_CHARS = 2_300_000; // ~1.7 MB of audio once base64-encoded

export interface CallRow {
  id: string; caller_id: string; callee_id: string; kind: CallKind; status: CallStatus;
  created_at: string; answered_at: string | null; last_ping_at: string | null;
}

export type CallStep =
  | { ok: true; to: CallStatus | null; outcome?: CallOutcome; durationMs?: number; expired?: boolean }
  | { ok: false; status: number; error: string };

/** The one conversation between two people: the smaller id is always first. */
export const pairOf = (a: string, b: string): [string, string] => (a < b ? [a, b] : [b, a]);

const at = (iso: string | null) => (iso ? Date.parse(iso) : NaN);

/** If the call has run out of time (never answered, or stopped sending heartbeats), what happens to it. */
export function expiryStep(call: CallRow, now: number): CallStep | null {
  if (call.status === 'ringing' && now - at(call.created_at) > RING_MS) return { ok: true, to: 'missed', outcome: 'missed', expired: true };
  if (call.status === 'accepted') {
    const answered = at(call.answered_at ?? call.created_at);
    const lastSeen = Math.max(answered, at(call.last_ping_at) || 0);
    if (now - lastSeen > STALE_MS) return { ok: true, to: 'ended', outcome: 'completed', durationMs: Math.max(0, lastSeen - answered), expired: true };
  }
  return null;
}

/** Decide what an action does to a call. Pure: the caller applies the result. */
export function nextCallStep(call: CallRow, action: CallAction, actorId: string, now: number): CallStep {
  const isCaller = actorId === call.caller_id;
  const isCallee = actorId === call.callee_id;
  if (!isCaller && !isCallee) return { ok: false, status: 403, error: 'This isn’t your call' };

  const expired = expiryStep(call, now);
  if (expired) return expired;

  if (['declined', 'canceled', 'missed', 'ended'].includes(call.status)) return { ok: true, to: null }; // already over: nothing to do

  if (call.status === 'ringing') {
    switch (action) {
      case 'accept':
        return isCallee ? { ok: true, to: 'accepted' } : { ok: false, status: 403, error: 'Only the person being called can answer' };
      case 'decline':
        return isCallee ? { ok: true, to: 'declined', outcome: 'declined' } : { ok: false, status: 403, error: 'Only the person being called can decline' };
      case 'cancel':
        return isCaller ? { ok: true, to: 'canceled', outcome: 'canceled' } : { ok: false, status: 403, error: 'Only the caller can cancel' };
      case 'end': // hanging up before it connects is a cancel for the caller and a decline for the callee
        return isCaller ? { ok: true, to: 'canceled', outcome: 'canceled' } : { ok: true, to: 'declined', outcome: 'declined' };
      default:
        return { ok: true, to: null };
    }
  }

  // accepted
  if (action === 'end' || action === 'cancel' || action === 'decline') {
    const answered = at(call.answered_at ?? call.created_at);
    return { ok: true, to: 'ended', outcome: 'completed', durationMs: Math.max(0, now - answered) };
  }
  return { ok: true, to: null }; // ping / a repeated accept
}

/** Can this call still be joined or answered right now? */
export function isCallOpen(call: CallRow, now: number): boolean {
  return (call.status === 'ringing' || call.status === 'accepted') && !expiryStep(call, now);
}

export function formatDuration(ms: number | null | undefined): string {
  const total = Math.max(0, Math.round((ms ?? 0) / 1000));
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

/** How a finished call reads in the chat, from the point of view of `mine` (you placed it) or not. */
export function callLabel(kind: CallKind | null, outcome: string, durationMs: number | null, mine: boolean): string {
  const noun = kind === 'video' ? 'video call' : 'voice call';
  const cap = noun[0].toUpperCase() + noun.slice(1);
  switch (outcome) {
    case 'completed': return `${cap} · ${formatDuration(durationMs)}`;
    case 'missed': return mine ? 'No answer' : `Missed ${noun}`;
    case 'canceled': return mine ? `Canceled ${noun}` : `Missed ${noun}`;
    case 'declined': return mine ? 'Call declined' : `Declined ${noun}`;
    default: return cap;
  }
}

export interface PreviewMessage { kind: string; sender_id: string; body: string; call_kind: CallKind | null; duration_ms: number | null }

/** One line for the conversation list. */
export function previewOf(m: PreviewMessage, viewerId: string): string {
  if (m.kind === 'voice') return '🎤 Voice message';
  if (m.kind === 'call') return `${m.call_kind === 'video' ? '🎥' : '📞'} ${callLabel(m.call_kind, m.body, m.duration_ms, m.sender_id === viewerId)}`;
  const text = m.body.replace(/\s+/g, ' ').trim();
  return text.length > 90 ? `${text.slice(0, 89)}…` : text;
}

/** Unread messages per conversation: other people's messages newer than your last read time. */
export function countUnread(
  messages: { conversation_id: string; sender_id: string; created_at: string }[],
  me: string,
  reads: Record<string, string | undefined>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of messages) {
    if (m.sender_id === me) continue;
    const seen = reads[m.conversation_id];
    if (seen && Date.parse(m.created_at) <= Date.parse(seen)) continue;
    out[m.conversation_id] = (out[m.conversation_id] ?? 0) + 1;
  }
  return out;
}

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

export function checkText(body: unknown): Checked<string> {
  if (typeof body !== 'string') return { ok: false, error: 'Write a message first' };
  const text = body.trim();
  if (!text) return { ok: false, error: 'Write a message first' };
  if (text.length > MAX_TEXT) return { ok: false, error: `Messages can be up to ${MAX_TEXT} characters` };
  return { ok: true, value: text };
}

const AUDIO_URL = /^data:(audio\/[a-z0-9.+-]+(?:;codecs=[a-z0-9.,+-]+)?);base64,([A-Za-z0-9+/]+={0,2})$/i;

/** A recorded voice note as sent by the browser: an audio data URL of sensible size and length. */
export function checkVoice(audio: unknown, durationMs: unknown): Checked<{ dataUrl: string; mime: string; durationMs: number }> {
  if (typeof audio !== 'string' || audio.length > MAX_VOICE_CHARS) return { ok: false, error: 'That voice message is too large' };
  const m = AUDIO_URL.exec(audio);
  if (!m || m[2].length < 64) return { ok: false, error: 'That doesn’t look like a voice message' };
  const ms = Number(durationMs);
  if (!Number.isFinite(ms) || ms < 400) return { ok: false, error: 'That voice message is too short' };
  if (ms > MAX_VOICE_MS + 2000) return { ok: false, error: 'Voice messages can be up to 3 minutes' };
  return { ok: true, value: { dataUrl: audio, mime: m[1], durationMs: Math.round(ms) } };
}

/** Both directions must exist for two people to chat. */
export function isMutual(rows: { follower_id: string; followee_id: string }[], a: string, b: string): boolean {
  return rows.some(r => r.follower_id === a && r.followee_id === b) && rows.some(r => r.follower_id === b && r.followee_id === a);
}
