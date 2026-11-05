import { NextResponse } from 'next/server';
import { admin } from '@/lib/supabase-admin';
import { route, getIdentity, withGuestCookie, fail } from '@/lib/auth';
import { getRoomBySlug, getRole, isBanned } from '@/lib/rooms';
import { mintToken } from '@/lib/livekit';
import { reconcileRoom } from '@/lib/room-lifecycle';
import type { JoinResponse } from '@/lib/types';

export const POST = route<{ params: Promise<{ slug: string }> }>(async (req, { params }) => {
  const { slug } = await params;
  const { identity, newGuestCookie } = await getIdentity(req);
  const { room } = await reconcileRoom(await getRoomBySlug(slug));
  if (room.status === 'ended') fail(410, 'This room has ended');
  if (!identity.isGuest && (await isBanned(room.id, identity.id))) fail(403, 'You have been removed from this room');
  const role = await getRole(room, identity.id, identity.isGuest);
  if (!identity.isGuest) {
    // Persist membership; ignoreDuplicates keeps any existing (possibly elevated) role untouched.
    await admin.from('room_memberships').upsert(
      { room_id: room.id, user_id: identity.id, role, updated_at: new Date().toISOString() },
      { onConflict: 'room_id,user_id', ignoreDuplicates: true });
  }
  const token = await mintToken({ roomName: room.slug, identity: identity.id, name: identity.name, role });
  const res: JoinResponse = { token, url: process.env.NEXT_PUBLIC_LIVEKIT_URL!, role };
  return withGuestCookie(NextResponse.json(res), newGuestCookie);
});
