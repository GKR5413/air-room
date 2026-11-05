/**
 * "People you may want to follow": pure ranking (no I/O) so it can be tested in isolation.
 * The API route gathers the signals from existing users; this decides the order and the reason shown.
 */

export type RecReason = 'follows_you' | 'mutual' | 'same_room' | 'popular' | 'new';

export interface Candidate {
  id: string;
  /** They already follow the current user. */
  followsYou: boolean;
  /** How many people the current user follows also follow this person. */
  mutuals: number;
  /** In how many rooms the current user and this person were both members. */
  sharedRooms: number;
  /** Total followers. */
  followers: number;
  createdAt?: string | null;
}

export interface Recommendation {
  id: string;
  score: number;
  reason: RecReason;
  mutuals: number;
}

const W = { followsYou: 70, mutual: 12, mutualCap: 5, room: 8, roomCap: 5, popularCap: 6 };

export function scoreCandidate(c: Candidate): number {
  return (
    (c.followsYou ? W.followsYou : 0) +
    Math.min(c.mutuals, W.mutualCap) * W.mutual +
    Math.min(c.sharedRooms, W.roomCap) * W.room +
    Math.min(Math.log2(1 + Math.max(0, c.followers)) * 2, W.popularCap)
  );
}

/** The single most meaningful reason to show next to a suggestion. */
export function reasonFor(c: Candidate): RecReason {
  if (c.followsYou) return 'follows_you';
  if (c.mutuals > 0) return 'mutual';
  if (c.sharedRooms > 0) return 'same_room';
  if (c.followers >= 3) return 'popular';
  return 'new';
}

const ms = (iso?: string | null) => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? 0 : t;
};

/** Highest score first; ties go to the newest profile, then id, so the order is stable. */
export function rankRecommendations(cands: Candidate[], limit = 8): Recommendation[] {
  return [...cands]
    .map(c => ({ c, score: scoreCandidate(c) }))
    .sort((a, b) => b.score - a.score || ms(b.c.createdAt) - ms(a.c.createdAt) || a.c.id.localeCompare(b.c.id))
    .slice(0, limit)
    .map(({ c, score }) => ({ id: c.id, score, reason: reasonFor(c), mutuals: c.mutuals }));
}

export function reasonLabel(reason: RecReason, mutuals = 0): string {
  switch (reason) {
    case 'follows_you': return 'Follows you';
    case 'mutual': return mutuals === 1 ? '1 mutual connection' : `${mutuals} mutual connections`;
    case 'same_room': return 'Was in a room with you';
    case 'popular': return 'Popular on AirRoom';
    default: return 'New to AirRoom';
  }
}
