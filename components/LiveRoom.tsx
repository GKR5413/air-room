'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Room, RoomEvent, Track } from 'livekit-client';
import { api, authHeaders } from '@/lib/supabase-browser';
import type { JoinResponse, ModAction, Role, RoomState } from '@/lib/types';
import RoomView, { type Conn, type RoomActions } from './RoomView';
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
 * server action. All rendering lives in <RoomView/>.
 */
export default function LiveRoom({ slug, onLeave }: { slug: string; onLeave: () => void }) {
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
    return () => { dead.current = true; disconnect(); };
  }, [connect, disconnect]);

  // Poll state
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const s = await api<RoomState>(`/api/rooms/${slug}/state`);
        if (!stop) setState(s);
      } catch { /* ignore transient */ }
    };
    tick();
    const id = setInterval(tick, 2000);
    return () => { stop = true; clearInterval(id); };
  }, [slug]);

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
    try { await fn(); return true; } catch (e: any) { toast(e.message || 'Something went wrong', 'error'); return false; }
  }, [toast]);

  const leave = useCallback(() => { disconnect(); onLeave(); }, [disconnect, onLeave]);

  const actions = useMemo<RoomActions>(() => ({
    leave,
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
  }), [slug, state?.me.invitationId, connect, leave, run, toast]);

  return (
    <>
      <div ref={audioBox} hidden />
      <RoomView
        state={state} status={status} connError={connError}
        micOn={micOn} micEver={micEver} speaking={speaking}
        blockedMsg={blockedMsg} actions={actions}
      />
    </>
  );
}
