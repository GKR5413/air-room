import { AccessToken, RoomServiceClient, TrackSource } from 'livekit-server-sdk';
import type { Role } from './types';

const httpUrl = () => process.env.NEXT_PUBLIC_LIVEKIT_URL!.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
export const lk = () => new RoomServiceClient(httpUrl(), process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!);

export const canSpeak = (r: Role) => r !== 'listener';

/** Short-lived token. Listeners can only subscribe; stage roles may publish microphone audio. */
export async function mintToken(opts: { roomName: string; identity: string; name: string; role: Role }) {
  const at = new AccessToken(process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!, {
    identity: opts.identity, name: opts.name, ttl: '15m', metadata: JSON.stringify({ role: opts.role }),
  });
  at.addGrant({
    room: opts.roomName, roomJoin: true, canSubscribe: true,
    canPublish: canSpeak(opts.role), canPublishSources: canSpeak(opts.role) ? [TrackSource.MICROPHONE] : [],
    canPublishData: false,
  });
  return at.toJwt();
}

/** Apply a new role to a live participant. Revoking also unpublishes tracks (LiveKit does this on permission change). */
export async function setParticipantRole(roomName: string, identity: string, role: Role) {
  try {
    await lk().updateParticipant(roomName, identity, JSON.stringify({ role }), {
      canSubscribe: true, canPublish: canSpeak(role), canPublishData: false,
      canPublishSources: canSpeak(role) ? [TrackSource.MICROPHONE] : [],
    });
  } catch { /* participant not connected: durable role in DB applies on next token */ }
}

export async function muteParticipant(roomName: string, identity: string) {
  try {
    const p = await lk().getParticipant(roomName, identity);
    for (const t of p.tracks) if (t.source === TrackSource.MICROPHONE) await lk().mutePublishedTrack(roomName, identity, t.sid, true);
  } catch { /* not connected */ }
}

export async function kick(roomName: string, identity: string) {
  try { await lk().removeParticipant(roomName, identity); } catch { /* not connected */ }
}

export async function closeRoom(roomName: string) {
  try { await lk().deleteRoom(roomName); } catch { /* no active room */ }
}

export async function listParticipants(roomName: string, strict = false) {
  try { return await lk().listParticipants(roomName); } catch (error: any) {
    // A missing room is empty. A network/auth failure is unknown, never evidence
    // that the panel has left (ending a room is irreversible).
    if (strict && error?.code !== 'not_found' && error?.status !== 404) throw error;
    return [];
  }
}

/** Remove only this connection, so a delayed leave cannot kick a newer rejoin. */
export async function leaveParticipant(roomName: string, identity: string, sid?: string) {
  try {
    const participant = await lk().getParticipant(roomName, identity);
    if (sid && participant.sid !== sid) return false;
    await lk().removeParticipant(roomName, identity);
    return true;
  } catch (error: any) {
    if (error?.code === 'not_found' || error?.status === 404) return false;
    throw error;
  }
}

/** Name of the LiveKit room that carries one private call. */
export const callRoomName = (callId: string) => `call-${callId}`;

/** Token for a private 1:1 call. Both people publish microphone and camera. */
export async function mintCallToken(opts: { callId: string; identity: string; name: string }) {
  const at = new AccessToken(process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!, {
    identity: opts.identity, name: opts.name, ttl: '3h',
  });
  at.addGrant({
    room: callRoomName(opts.callId), roomJoin: true, canSubscribe: true,
    canPublish: true, canPublishSources: [TrackSource.MICROPHONE, TrackSource.CAMERA], canPublishData: false,
  });
  return at.toJwt();
}
