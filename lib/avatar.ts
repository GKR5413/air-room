import { createHash } from 'node:crypto';

/**
 * Photos are stored as data URLs. Embedding them in list responses (room state polls every
 * 2 seconds) would resend the same bytes over and over, so lists carry a short, cacheable
 * URL instead. The `v` fingerprint changes when the photo changes, so browsers can cache
 * each photo forever and fetch it once.
 */
export function avatarUrl(id: string, stored?: string | null): string | null {
  if (!stored) return null;
  if (!stored.startsWith('data:')) return stored;
  const v = createHash('sha1').update(stored).digest('base64url').slice(0, 10);
  return `/api/avatar/${id}?v=${v}`;
}

/** Decode a stored `data:image/...;base64,...` photo into bytes. */
export function parseDataUrl(stored: string): { type: string; bytes: Buffer } | null {
  const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(stored);
  return m ? { type: m[1], bytes: Buffer.from(m[2], 'base64') } : null;
}
