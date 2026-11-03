import { NextRequest, NextResponse } from 'next/server';
import { admin } from './supabase-admin';
import type { Identity } from './types';

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export const fail = (status: number, message: string) => { throw new HttpError(status, message); };

/** Wrap a route handler so HttpError becomes a JSON response. */
export function route<C = any>(fn: (req: NextRequest, ctx: C) => Promise<unknown>) {
  return async (req: NextRequest, ctx: C) => {
    try {
      const out = await fn(req, ctx);
      return out instanceof NextResponse ? out : NextResponse.json(out ?? { ok: true });
    } catch (e) {
      if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
      console.error(e);
      return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
  };
}

/** Signed-in user from Bearer token, or null. */
export async function getUser(req: NextRequest): Promise<Identity | null> {
  const h = req.headers.get('authorization');
  if (!h?.startsWith('Bearer ')) return null;
  const { data, error } = await admin.auth.getUser(h.slice(7));
  if (error || !data.user) return null;
  const { data: p } = await admin.from('profiles').select('display_name').eq('id', data.user.id).single();
  return { id: data.user.id, name: p?.display_name ?? 'User', isGuest: false };
}

export async function requireUser(req: NextRequest): Promise<Identity> {
  return (await getUser(req)) ?? fail(401, 'Sign in required');
}

/** User if signed in, else a guest identity stored in a cookie set by the caller via guestCookie(). */
export async function getIdentity(req: NextRequest): Promise<{ identity: Identity; newGuestCookie?: string }> {
  const u = await getUser(req);
  if (u) return { identity: u };
  const existing = req.cookies.get('ar_guest')?.value;
  const id = existing && /^guest-[a-f0-9-]{36}$/.test(existing) ? existing : `guest-${crypto.randomUUID()}`;
  return { identity: { id, name: 'Guest', isGuest: true }, newGuestCookie: existing === id ? undefined : id };
}

export function withGuestCookie(res: NextResponse, cookie?: string) {
  if (cookie) res.cookies.set('ar_guest', cookie, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30 });
  return res;
}
