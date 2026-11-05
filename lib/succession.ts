/**
 * Moderator succession: pure decision logic (no I/O) so it can be tested in isolation.
 *
 * When no host/moderator is connected while a speaker is still
 * on stage, the speaker who has held the stage longest is promoted to moderator.
 */

/** How long a room may go without a connected host/moderator before a speaker steps up. Zero makes succession immediate. */
export const LEADER_GRACE_MS = 0;
/** While a leader is present, refresh `leader_seen_at` at most this often (limits writes). */
export const LEADER_TOUCH_MS = 10_000;

export type Speaker = { id: string; since: string };

export type Succession =
  | { kind: 'none' }
  | { kind: 'touch' }              // a leader is present: refresh leader_seen_at
  | { kind: 'promote'; id: string };

const ms = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
};

/** The speaker who has been on stage longest; the id breaks exact ties so the pick is stable. */
export function pickSuccessor(speakers: Speaker[]): string | null {
  if (!speakers.length) return null;
  return [...speakers].sort((a, b) => ms(a.since) - ms(b.since) || a.id.localeCompare(b.id))[0].id;
}

export function decideSuccession(o: {
  now: number;
  seenAt: string | null | undefined;
  leaderOnline: boolean;
  speakers: Speaker[];
}): Succession {
  const seen = o.seenAt ? Date.parse(o.seenAt) : NaN;

  if (o.leaderOnline) {
    return Number.isNaN(seen) || o.now - seen > LEADER_TOUCH_MS ? { kind: 'touch' } : { kind: 'none' };
  }

  const successor = pickSuccessor(o.speakers);
  if (!successor) return { kind: 'none' };
  if (Number.isNaN(seen)) return { kind: 'promote', id: successor };
  if (o.now - seen < LEADER_GRACE_MS) return { kind: 'none' };
  return { kind: 'promote', id: successor };
}
