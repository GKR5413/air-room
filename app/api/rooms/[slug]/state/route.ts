import { NextResponse } from 'next/server';
import { TrackSource } from 'livekit-server-sdk';
import { admin } from '@/lib/supabase-admin';
import { route, getIdentity, withGuestCookie, fail } from '@/lib/auth';
import { getRoomBySlug, getRole, isMod, isBanned } from '@/lib/rooms';
import { reconcileRoom } from '@/lib/room-lifecycle';
import { namesFor, isUuid } from '@/lib/api';
import { avatarUrl } from '@/lib/avatar';
import type { RoomState, StageMember, Role } from '@/lib/types';

const order: Record<Role, number> = { host: 0, moderator: 1, speaker: 2, listener: 3 };

export const GET = route<{ params: Promise<{ slug: string }> }>(async (req, { params }) => {
  const { slug } = await params;
  const { identity, newGuestCookie } = await getIdentity(req);
  let room = await getRoomBySlug(slug);
  if (!identity.isGuest && (await isBanned(room.id, identity.id))) fail(403, 'You have been removed from this room');
  let role = await getRole(room, identity.id, identity.isGuest);

  const result = await reconcileRoom(room);
  room = result.room;
  const parts = result.participants;
  const roles = new Map<string, Role>(result.members.map(m => [m.user_id, m.role]));
  if (result.promoted) {
    roles.set(result.promoted, 'moderator');
    if (result.promoted === identity.id) role = 'moderator';
  }
  roles.set(room.host_id, 'host');
  const connected = new Map(parts.map((p) => [p.identity, p]));
  const stageIds = [...roles.keys()].filter((id) => connected.has(id));

  // Signed-in people who are just listening (guests stay anonymous and are counted only).
  const stageSet = new Set(stageIds);
  const listenerIds = parts.map((p) => p.identity).filter((id) => !stageSet.has(id) && isUuid(id)).slice(0, 30);

  const mods = isMod(role);
  const handsRes = mods
    ? await admin.from('hand_requests').select('user_id, created_at').eq('room_id', room.id).eq('status', 'pending').order('created_at', { ascending: true })
    : { data: [] as any[] };
  const hands = handsRes.data ?? [];
  const names = await namesFor([...new Set([room.host_id, ...stageIds, ...listenerIds, ...hands.map((h: any) => h.user_id)])]);

  const { data: profiles, error: profileError } = stageIds.length || listenerIds.length
    ? await admin.from('profiles').select('id, avatar_url, username').in('id', [...stageIds, ...listenerIds])
    : { data: [], error: null };
  if (profileError) fail(500, 'Could not load stage profiles');
  const profileMap = new Map((profiles ?? []).map(p => [p.id, p]));

  const stage: StageMember[] = stageIds.map((id) => {
    const mic = connected.get(id)!.tracks.find((t) => t.source === TrackSource.MICROPHONE);
    return { id, name: names[id] ?? 'User', avatar_url: avatarUrl(id, profileMap.get(id)?.avatar_url), username: profileMap.get(id)?.username, role: roles.get(id)!, muted: !mic || mic.muted, speaking: false };
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
    listeners: listenerIds.map((id) => ({ id, name: names[id] ?? 'User', avatar_url: avatarUrl(id, profileMap.get(id)?.avatar_url), username: profileMap.get(id)?.username ?? null })),
    audienceCount: Math.max(0, parts.length - stage.length),
    hands: hands.map((h: any) => ({ userId: h.user_id, name: names[h.user_id] ?? 'User', createdAt: h.created_at })),
  };
  return withGuestCookie(NextResponse.json(state), newGuestCookie);
});
