import type { CallKind } from './chat-core';

export interface ChatPerson { id: string; name: string; username: string | null; avatar_url: string | null }

export interface ChatMessage {
  id: string; sender_id: string; kind: 'text' | 'voice' | 'call'; body: string;
  duration_ms: number | null; call_kind: CallKind | null; created_at: string;
  /** Only on the sender's own screen, while the message is on its way. */
  pending?: boolean;
}

export interface ConversationItem {
  id: string; person: ChatPerson; unread: number; canChat: boolean;
  last: { preview: string; at: string; mine: boolean };
}

export interface CallView {
  id: string; kind: CallKind; status: string; conversation_id: string; role: 'caller' | 'callee';
  created_at: string; answered_at: string | null; person: ChatPerson;
}

export const clockTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** "Today", "Yesterday", a weekday this week, or a date. For separators between days in a chat. */
export function dayLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return d.toLocaleDateString([], { weekday: 'long' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}

/** Compact time for the conversation list: a clock time today, otherwise a day. */
export function listTime(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (days <= 0) return clockTime(iso);
  if (days === 1) return 'Yesterday';
  if (days < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}
