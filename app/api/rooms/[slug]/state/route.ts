import { NextResponse } from 'next/server';
import { TrackSource } from 'livekit-server-sdk';
import { admin } from '@/lib/supabase-admin';
import { route, getIdentity, withGuestCookie, fail } from '@/lib/auth';
import { getRoomBySlug, getRole, isMod, isBanned } from '@/lib/rooms';
import { listParticipants } from '@/lib/livekit';
import { namesFor } from '@/lib/api';
import type { RoomState, StageMember, Role } from '@/lib/types';

const order: Record<Role, number> = { host: 0, moderator: 1, speaker: 2, listener: 3 };

export const GET = route<{ params: Promise<{ slug: string }> }>(async (req, { params }) => {
  const { slug } = await params;
  const { identity, newGuestCookie } = await getIdentity(req);
  const room = await getRoomBySlug(slug);
  if (!identity.isGuest && (await isBanned(room.id, identity.id))) fail(403, 'You have been removed from this room');
  const role = await getRole(room, identity.id, identity.isGuest);

  const [parts, memRes] = await Promise.all([
    room.status === 'live' ? listParticipants(room.slug) : Promise.resolve([]),
    admin.from('room_memberships').select('user_id, role').eq('room_id', room.id).neq('role', 'listener'),
  ]);
  const roles = new Map<string, Role>((memRes.data ?? []).map((m: any) => [m.user_id, m.role as Role]));
  roles.set(room.host_id, 'host');
  const connected = new Map(parts.map((p) => [p.identity, p]));
  const stageIds = [...roles.keys()].filter((id) => connected.has(id));

  const mods = isMod(role);
  const handsRes = mods
    ? await admin.from('hand_requests').select('user_id, created_at').eq('room_id', room.id).eq('status', 'pending').order('created_at', { ascending: true })
    : { data: [] as any[] };
  const hands = handsRes.data ?? [];
  const names = await namesFor([...new Set([room.host_id, ...stageIds, ...hands.map((h: any) => h.user_id)])]);

  const stage: StageMember[] = stageIds.map((id) => {
    const mic = connected.get(id)!.tracks.find((t) => t.source === TrackSource.MICROPHONE);
    return { id, name: names[id] ?? 'User', role: roles.get(id)!, muted: !mic || mic.muted, speaking: false };
  }).sort((a, b) => order[a.role] - order[b.role]);

  let handPending = false, invitationId: string | null = null;
  if (!identity.isGuest) {
    const [h, i] = await Promise.all([
      admin.from('hand_requests').select('id').eq('room_id', room.id).eq('user_id', identity.id).eq('status', 'pending').maybeSingle(),
      admin.from('stage_invitations').select('id').eq('room_id', room.id).eq('user_id', identity.id).eq('status', 'pending').maybeSingle(),
    ]);
    handPending = !!h.data; invitationId = i.data?.id ?? null;
  }

  const state: RoomState = {
    room: { slug: room.slug, title: room.title, description: room.description, topic: room.topic, language: room.language,
      visibility: room.visibility, status: room.status, hands_enabled: room.hands_enabled, host_name: names[room.host_id] ?? 'User' },
    me: { id: identity.id, role, isGuest: identity.isGuest, handPending, invitationId },
    stage,
    audienceCount: Math.max(0, parts.length - stage.length),
    hands: hands.map((h: any) => ({ userId: h.user_id, name: names[h.user_id] ?? 'User', createdAt: h.created_at })),
  };
  return withGuestCookie(NextResponse.json(state), newGuestCookie);
});
