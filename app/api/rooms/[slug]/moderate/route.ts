import { admin } from '@/lib/supabase-admin';
import { route, requireUser, fail } from '@/lib/auth';
import { getRoomBySlug, getRole, isMod, isBanned, setRole, logAction } from '@/lib/rooms';
import { setParticipantRole, muteParticipant, kick } from '@/lib/livekit';
import { body, requireLive, isGuestId, isUuid, transferHost } from '@/lib/api';
import type { ModAction } from '@/lib/types';
import { reconcileRoom } from '@/lib/room-lifecycle';

const ACTIONS: ModAction[] = ['invite', 'dismiss_hand', 'mute', 'to_audience', 'remove', 'appoint_mod', 'remove_mod', 'transfer_host', 'pause_hands', 'resume_hands'];

export const POST = route<{ params: Promise<{ slug: string }> }>(async (req, { params }) => {
  const { slug } = await params;
  const u = await requireUser(req);
  const room = await getRoomBySlug(slug);
  const b = await body(req);
  const action = b.action as ModAction;
  if (!ACTIONS.includes(action)) fail(400, `action must be one of: ${ACTIONS.join(', ')}`);
  requireLive(room);
  const myRole = await getRole(room, u.id, false);
  if (!isMod(myRole)) fail(403, 'Moderator permission required');
  const isHost = myRole === 'host';

  if (action === 'pause_hands' || action === 'resume_hands') {
    await admin.from('rooms').update({ hands_enabled: action === 'resume_hands' }).eq('id', room.id);
    await logAction(room.id, u.id, null, action);
    return { ok: true };
  }

  const target = b.target;
  if (typeof target !== 'string' || !target) fail(400, 'target is required for this action');
  if (isGuestId(target) && action !== 'remove') fail(400, 'Guests can only be removed');
  if (!isGuestId(target) && !isUuid(target)) fail(400, 'target must be a user id');
  const targetRole = await getRole(room, target, isGuestId(target));
  if (action !== 'dismiss_hand' && action !== 'invite') {
    if (target === room.host_id) fail(403, 'Nobody can act on the host');
  }
  if (action === 'invite' || action === 'dismiss_hand' || action === 'mute' || action === 'to_audience' || action === 'remove') {
    if (target === room.host_id) fail(403, 'Nobody can act on the host');
    if (targetRole === 'moderator' && !isHost) fail(403, 'Only the host can act on a moderator');
  }

  switch (action) {
    case 'invite': {
      if (target === u.id) fail(400, 'You cannot invite yourself');
      if (targetRole !== 'listener') fail(400, 'User is already on stage');
      if (await isBanned(room.id, target)) fail(400, 'User is banned from this room');
      const { data: existing } = await admin.from('stage_invitations').select('id').eq('room_id', room.id).eq('user_id', target).eq('status', 'pending').maybeSingle();
      if (!existing) {
        const { error } = await admin.from('stage_invitations').insert({ room_id: room.id, user_id: target, invited_by: u.id });
        if (error) fail(error.code === '23503' ? 404 : 500, error.code === '23503' ? 'User not found' : error.message);
      }
      await admin.from('hand_requests').update({ status: 'invited' }).eq('room_id', room.id).eq('user_id', target).eq('status', 'pending');
      break;
    }
    case 'dismiss_hand':
      await admin.from('hand_requests').update({ status: 'dismissed' }).eq('room_id', room.id).eq('user_id', target).eq('status', 'pending');
      break;
    case 'mute':
      if (targetRole !== 'speaker' && targetRole !== 'moderator') fail(400, 'Target is not on stage');
      await muteParticipant(room.slug, target);
      break;
    case 'to_audience':
      if (targetRole === 'listener') fail(400, 'Target is already in the audience');
      await setRole(room.id, target, 'listener');
      await setParticipantRole(room.slug, target, 'listener');
      break;
    case 'remove':
      if (target === u.id) fail(400, 'You cannot remove yourself');
      if (!isGuestId(target)) {
        await admin.from('room_bans').upsert({ room_id: room.id, user_id: target, banned_by: u.id });
        await setRole(room.id, target, 'listener');
        await admin.from('stage_invitations').update({ status: 'revoked' }).eq('room_id', room.id).eq('user_id', target).eq('status', 'pending');
        await admin.from('hand_requests').update({ status: 'withdrawn' }).eq('room_id', room.id).eq('user_id', target).eq('status', 'pending');
      }
      await kick(room.slug, target);
      break;
    case 'appoint_mod':
    case 'remove_mod':
    case 'transfer_host': {
      if (!isHost) fail(403, 'Only the host can do this');
      if (target === u.id) fail(400, 'Target must be someone else');
      if (action === 'remove_mod') {
        if (targetRole !== 'moderator') fail(400, 'Target is not a moderator');
        await setRole(room.id, target, 'speaker');
        await setParticipantRole(room.slug, target, 'speaker');
      } else {
        if (await isBanned(room.id, target)) fail(400, 'User is banned from this room');
        if (action === 'appoint_mod') {
          await setRole(room.id, target, 'moderator');
          await setParticipantRole(room.slug, target, 'moderator');
        } else {
          await transferHost(room, target);
        }
      }
      break;
    }
  }
  await logAction(room.id, u.id, isGuestId(target) ? null : target, action);
  if (action === 'to_audience' || action === 'remove') await reconcileRoom(room);
  return { ok: true };
});
