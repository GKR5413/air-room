'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Room, RoomEvent, Track } from 'livekit-client';
import { api, authHeaders } from '@/lib/supabase-browser';
import type { JoinResponse, ModAction, Role, RoomState } from '@/lib/types';
import RoomView, { type Conn, type RoomActions } from './RoomView';
import MiniRoom from './MiniRoom';
import { useLiveRefresh } from '@/lib/use-live-refresh';
import { useToast } from './Providers';

async function joinRequest(slug: string): Promise<{ status: number; data: any }> {
  const res = await fetch(`/api/rooms/${slug}/join`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: '{}',
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

/**
 * Owns the realtime side of a room: LiveKit connection, state polling and every
 * server action. It is mounted by <RoomSessionProvider/> in the root layout, so it stays
 * connected while you browse: <RoomView/> renders when `visible`, <MiniRoom/> otherwise.
 */
export default function LiveRoom({ slug, visible, onLeave, onMinimize, onTitle }: {
  slug: string;
  /** True while the user is on this room's page. */
  visible: boolean;
  onLeave: () => void;
  onMinimize: () => void;
  onTitle: (title: string) => void;
}) {
  const toast = useToast();
  const [state, setState] = useState<RoomState | null>(null);
  const [conn, setConn] = useState<Conn>('connecting');
  const [canPlay, setCanPlay] = useState(true);
  const [micProblem, setMicProblem] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [micEver, setMicEver] = useState(false);
  const [speaking, setSpeaking] = useState<Set<string>>(new Set());
  const [blockedMsg, setBlockedMsg] = useState('');
  const [connError, setConnError] = useState('');

  const roomRef = useRef<Room | null>(null);
  const audioBox = useRef<HTMLDivElement>(null);
  const tokenRole = useRef<Role | null>(null);
  const connecting = useRef(false);
  const dead = useRef(false);
  const departureHeaders = useRef<Record<string, string>>({});
  const leaving = useRef(false);

  useEffect(() => {
    const update = () => { void authHeaders().then(h => { departureHeaders.current = h; }); };
    update();
    const timer = setInterval(update, 60000);
    return () => clearInterval(timer);
  }, []);

  const notifyDeparture = useCallback((room: Room | null) => {
    const participantSid = room?.localParticipant.sid;
    if (!participantSid) return Promise.resolve();
    return fetch(`/api/rooms/${slug}/depart`, {
      method: 'POST', credentials: 'include', keepalive: true,
      headers: { 'Content-Type': 'application/json', ...departureHeaders.current },
      body: JSON.stringify({ participantSid }),
    }).then(res => { if (!res.ok) throw new Error('Could not finish leaving the room'); });
  }, [slug]);

  const disconnect = useCallback(() => {
    const r = roomRef.current;
    roomRef.current = null;
    if (r) { r.removeAllListeners(); r.disconnect(); }
    if (audioBox.current) audioBox.current.innerHTML = '';
  }, []);

  const connect = useCallback(async () => {
    if (connecting.current) return;
    connecting.current = true;
    try {
      setConn('connecting');
      setConnError('');
      departureHeaders.current = await authHeaders();
      const { status, data } = await joinRequest(slug);
      if (status === 410) { setBlockedMsg('This room has ended. The conversation is over.'); return; }
      if (status === 403) { setBlockedMsg('You have been removed from this room.'); return; }
      if (status < 200 || status >= 300) throw new Error(data.error || `Join failed (${status})`);
      const { token, url, role } = data as JoinResponse;
      if (dead.current) return;
      disconnect();
      const room = new Room({ adaptiveStream: true });
      room
        .on(RoomEvent.TrackSubscribed, (track) => {
          if (track.kind === Track.Kind.Audio && audioBox.current) {
            const el = track.attach();
            el.autoplay = true;
            audioBox.current.appendChild(el);
          }
        })
        .on(RoomEvent.TrackUnsubscribed, (track) => { track.detach().forEach(el => el.remove()); })
        .on(RoomEvent.ActiveSpeakersChanged, (s) => setSpeaking(new Set(s.map(p => p.identity))))
        .on(RoomEvent.AudioPlaybackStatusChanged, () => setCanPlay(room.canPlaybackAudio))
        .on(RoomEvent.Reconnecting, () => setConn('reconnecting'))
        .on(RoomEvent.Reconnected, () => setConn('listening'))
        .on(RoomEvent.Disconnected, () => { if (roomRef.current === room) setConn('closed'); })
        .on(RoomEvent.LocalTrackPublished, () => setMicOn(room.localParticipant.isMicrophoneEnabled))
        .on(RoomEvent.TrackMuted, () => setMicOn(room.localParticipant.isMicrophoneEnabled))
        .on(RoomEvent.TrackUnmuted, () => setMicOn(room.localParticipant.isMicrophoneEnabled));
      roomRef.current = room;
      tokenRole.current = role;
      setMicOn(false); setMicEver(false); setMicProblem(false);
      await room.connect(url, token);
      if (dead.current || roomRef.current !== room) { await room.disconnect(); return; }
      setCanPlay(room.canPlaybackAudio);
      setConn('listening');
    } catch (e: any) {
      setConnError(e.message || 'Could not connect');
      setConn('closed');
    } finally {
      connecting.current = false;
    }
  }, [slug, disconnect]);

  useEffect(() => {
    dead.current = false;
    connect();
    const departing = () => { void notifyDeparture(roomRef.current).catch(() => {}); };
    window.addEventListener('pagehide', departing);
    return () => {
      dead.current = true;
      window.removeEventListener('pagehide', departing);
      departing();
      disconnect();
    };
  }, [connect, disconnect, notifyDeparture]);

  const refreshState = useCallback(async () => {
    try {
      const s = await api<RoomState>(`/api/rooms/${slug}/state`);
      if (!dead.current) setState(s);
    } catch (e: any) {
      if (!dead.current && /removed from this room/i.test(e.message)) setBlockedMsg(e.message);
    }
  }, [slug]);
  useEffect(() => { void refreshState(); }, [refreshState]);
  useLiveRefresh([`room:${slug}`, 'profiles', 'me'], refreshState, 2000);
  // LiveKit is authoritative for connectivity, mute and speaker changes.
  useEffect(() => {
    const room = roomRef.current;
    if (!room) return;
    const update = () => { void refreshState(); };
    room.on(RoomEvent.ParticipantConnected, update).on(RoomEvent.ParticipantDisconnected, update)
      .on(RoomEvent.ParticipantMetadataChanged, update).on(RoomEvent.TrackMuted, update).on(RoomEvent.TrackUnmuted, update);
    return () => {
      room.off(RoomEvent.ParticipantConnected, update).off(RoomEvent.ParticipantDisconnected, update)
        .off(RoomEvent.ParticipantMetadataChanged, update).off(RoomEvent.TrackMuted, update).off(RoomEvent.TrackUnmuted, update);
    };
  }, [conn, refreshState]);

  // Role changes -> disable mic and reconnect for fresh token
  const stateRole = state?.me.role;
  const ended = state?.room.status === 'ended';
  useEffect(() => {
    if (!stateRole || !tokenRole.current || stateRole === tokenRole.current || ended || blockedMsg) return;
    const wasStage = tokenRole.current !== 'listener';
    const nowStage = stateRole !== 'listener';
    if (wasStage === nowStage) {
      // Host, moderator and speaker share the same publish rights and the server has already
      // updated this live connection, so don't reconnect (that would cut the mic).
      if (stateRole === 'moderator' && tokenRole.current === 'speaker') toast('You’re now a moderator. You can manage the stage and hands.', 'ok');
      tokenRole.current = stateRole;
      return;
    }
    (async () => {
      if (wasStage && !nowStage) {
        try { await roomRef.current?.localParticipant.setMicrophoneEnabled(false); } catch { /* ignore */ }
        setMicOn(false);
      }
      await connect();
    })();
  }, [stateRole, ended, blockedMsg, connect, toast]);

  useEffect(() => {
    if (ended) disconnect();
  }, [ended, disconnect]);

  const status: Conn = conn === 'listening' ? (!canPlay ? 'blocked' : micProblem ? 'mic' : 'listening') : conn;

  /** Run a server action; surface failures as a toast. Resolves to whether it succeeded. */
  const run = useCallback(async (fn: () => Promise<unknown>) => {
    try { await fn(); await refreshState(); return true; } catch (e: any) { toast(e.message || 'Something went wrong', 'error'); return false; }
  }, [toast, refreshState]);

  const leave = useCallback(async () => {
    if (leaving.current) return;
    leaving.current = true;
    try { await notifyDeparture(roomRef.current); }
    catch (e: any) { toast(e.message, 'error'); }
    finally { disconnect(); onLeave(); leaving.current = false; }
  }, [disconnect, onLeave, notifyDeparture, toast]);

  const title = state?.room.title;
  useEffect(() => { if (title) onTitle(title); }, [title, onTitle]);

  // Room ended or we were removed while browsing elsewhere: say so and drop the session.
  useEffect(() => {
    if (visible || !(ended || blockedMsg)) return;
    toast(blockedMsg || `“${title ?? 'The room'}” has ended.`, 'info');
    leave();
  }, [visible, ended, blockedMsg, title, toast, leave]);

  const actions = useMemo<RoomActions>(() => ({
    leave,
    minimize: onMinimize,
    reconnect: () => { connect(); },
    startAudio: () => { roomRef.current?.startAudio().then(() => setCanPlay(true)); },
    setMic: async (on) => {
      try {
        await roomRef.current?.localParticipant.setMicrophoneEnabled(on);
        setMicProblem(false);
        setMicOn(on);
        if (on) setMicEver(true);
      } catch {
        setMicProblem(true);
      }
    },
    raiseHand: () => { run(() => api(`/api/rooms/${slug}/hand`, { action: 'raise' })); },
    lowerHand: () => { run(() => api(`/api/rooms/${slug}/hand`, { action: 'lower' })); },
    acceptInvite: () => {
      const id = state?.me.invitationId;
      if (!id) return;
      run(async () => {
        await api(`/api/rooms/${slug}/invitation`, { action: 'accept', id });
        await connect();
      });
    },
    declineInvite: () => {
      const id = state?.me.invitationId;
      if (!id) return;
      run(() => api(`/api/rooms/${slug}/invitation`, { action: 'decline', id }));
    },
    moderate: (action: ModAction, target?: string) => { run(() => api(`/api/rooms/${slug}/moderate`, { action, target })); },
    toAudience: (id) => { run(() => api(`/api/rooms/${slug}/moderate`, { action: 'to_audience', target: id })); },
    endRoom: () => { run(() => api(`/api/rooms/${slug}/end`, {})); },
    hostLeave: async (mode, newHostId) => {
      await run(async () => {
        await api(`/api/rooms/${slug}/leave`, mode === 'end' ? { mode } : { mode, newHostId });
        leave();
      });
    },
    report: async (reason, details) => {
      const ok = await run(() => api(`/api/rooms/${slug}/report`, { reason, details }));
      if (ok) toast('Report sent. Thank you.', 'ok');
      return ok;
    },
  }), [slug, state?.me.invitationId, connect, leave, onMinimize, run, toast]);

  return (
    <>
      <div ref={audioBox} hidden />
      {visible ? (
        <main>
          <RoomView
            state={state} status={status} connError={connError}
            micOn={micOn} micEver={micEver} speaking={speaking}
            blockedMsg={blockedMsg} actions={actions}
          />
        </main>
      ) : (
        <MiniRoom slug={slug} state={state} status={status} micOn={micOn} actions={actions} />
      )}
    </>
  );
}
