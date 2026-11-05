'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, MicOff, PhoneOff, SwitchCamera, Video, VideoOff } from 'lucide-react';
import type { Room } from 'livekit-client';
import { api } from '@/lib/supabase-browser';
import { formatDuration } from '@/lib/chat-core';
import type { CallView } from '@/lib/chat-types';
import Avatar from './Avatar';

const ENDED_TEXT: Record<string, string> = {
  ended: 'Call ended', declined: 'Call declined', canceled: 'Call canceled', missed: 'No answer',
};

/** The full-screen call: live audio (and video) through LiveKit, with the usual controls. */
export default function CallScreen({ call, onClose }: { call: CallView; onClose: () => void }) {
  const video = call.kind === 'video';
  const roomRef = useRef<Room | null>(null);
  const remoteEl = useRef<HTMLVideoElement>(null);
  const localEl = useRef<HTMLVideoElement>(null);
  const audioBox = useRef<HTMLDivElement>(null);
  const finished = useRef(false);
  const leftTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hangUpRef = useRef<() => void>(() => {});

  const [status, setStatus] = useState(call.status);
  const [answeredAt, setAnsweredAt] = useState<string | null>(call.answered_at);
  const [remoteIn, setRemoteIn] = useState(false);
  const [remoteVideo, setRemoteVideo] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(video);
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [reconnecting, setReconnecting] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [notice, setNotice] = useState('');
  const [endedText, setEndedText] = useState('');
  const [now, setNow] = useState(Date.now());

  const finish = useCallback((text: string) => {
    if (finished.current) return;
    finished.current = true;
    setEndedText(text);
    const room = roomRef.current;
    roomRef.current = null;
    if (room) { room.removeAllListeners(); void room.disconnect(); }
    setTimeout(onClose, 1300);
  }, [onClose]);

  // Join the audio/video room.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { token, url } = await api<{ token: string; url: string }>(`/api/chat/calls/${call.id}/token`, {});
        const { Room, RoomEvent, Track } = await import('livekit-client');
        if (cancelled) return;
        const room = new Room({ adaptiveStream: true, dynacast: true });
        roomRef.current = room;
        const showLocal = () => {
          const pub = room.localParticipant.getTrackPublication(Track.Source.Camera);
          if (pub?.videoTrack && localEl.current) pub.videoTrack.attach(localEl.current);
        };
        room
          .on(RoomEvent.TrackSubscribed, track => {
            if (track.kind === Track.Kind.Audio) { audioBox.current?.appendChild(track.attach()); }
            else if (track.kind === Track.Kind.Video && remoteEl.current) { track.attach(remoteEl.current); setRemoteVideo(true); }
          })
          .on(RoomEvent.TrackUnsubscribed, track => {
            if (track.kind === Track.Kind.Video) { track.detach(); setRemoteVideo(false); }
            else track.detach().forEach(el => el.remove());
          })
          .on(RoomEvent.ParticipantConnected, () => { clearTimeout(leftTimer.current); setRemoteIn(true); })
          .on(RoomEvent.ParticipantDisconnected, () => {
            // They hung up or lost their connection. If they don't come back shortly, end the call instead of leaving you in an empty one.
            setRemoteIn(false);
            clearTimeout(leftTimer.current);
            leftTimer.current = setTimeout(() => hangUpRef.current(), 4000);
          })
          .on(RoomEvent.LocalTrackPublished, showLocal)
          .on(RoomEvent.Reconnecting, () => setReconnecting(true))
          .on(RoomEvent.Reconnected, () => setReconnecting(false))
          .on(RoomEvent.AudioPlaybackStatusChanged, () => setAudioBlocked(!room.canPlaybackAudio));
        await room.connect(url, token);
        if (cancelled) { void room.disconnect(); return; }
        setRemoteIn(room.remoteParticipants.size > 0);
        setAudioBlocked(!room.canPlaybackAudio);
        try { await room.localParticipant.setMicrophoneEnabled(true); }
        catch { setMicOn(false); setNotice('Allow microphone access so they can hear you'); }
        if (video) {
          try { await room.localParticipant.setCameraEnabled(true, { facingMode: 'user' }); showLocal(); }
          catch { setCamOn(false); setNotice('Camera unavailable. Continuing with audio only'); }
        }
      } catch (e: any) {
        if (!cancelled) { finish(/ended/i.test(e?.message ?? '') ? 'Call ended' : 'Couldn’t connect the call'); }
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(leftTimer.current);
      const room = roomRef.current;
      roomRef.current = null;
      if (room) { room.removeAllListeners(); void room.disconnect(); }
    };
  }, [call.id, video, finish]);

  // Follow what the other person does (answers, declines, hangs up), and keep the call alive.
  useEffect(() => {
    let beat = 0;
    const timer = setInterval(async () => {
      if (finished.current) return;
      try {
        const { call: c } = await api<{ call: CallView }>(`/api/chat/calls/${call.id}`);
        setStatus(c.status); setAnsweredAt(c.answered_at);
        if (ENDED_TEXT[c.status]) { finish(call.role === 'callee' && c.status === 'missed' ? 'Missed call' : ENDED_TEXT[c.status]); return; }
        if (c.status === 'accepted' && ++beat % 6 === 0) void api(`/api/chat/calls/${call.id}`, { action: 'ping' }).catch(() => {});
      } catch { /* a blip: the next poll will catch up */ }
    }, 2500);
    return () => clearInterval(timer);
  }, [call.id, call.role, finish]);

  // Clock for the call timer.
  useEffect(() => {
    if (!answeredAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [answeredAt]);

  async function hangUp() {
    try { await api(`/api/chat/calls/${call.id}`, { action: 'end' }); } catch { /* leave anyway */ }
    finish('Call ended');
  }
  hangUpRef.current = () => { void hangUp(); };
  async function toggleMic() {
    const room = roomRef.current; if (!room) return;
    const next = !micOn;
    try { await room.localParticipant.setMicrophoneEnabled(next); setMicOn(next); } catch { setNotice('Couldn’t reach the microphone'); }
  }
  async function toggleCam() {
    const room = roomRef.current; if (!room) return;
    const next = !camOn;
    try {
      await room.localParticipant.setCameraEnabled(next, next ? { facingMode: facing } : undefined);
      setCamOn(next);
      if (next) { const { Track } = await import('livekit-client'); room.localParticipant.getTrackPublication(Track.Source.Camera)?.videoTrack?.attach(localEl.current!); }
    } catch { setNotice('Couldn’t reach the camera'); }
  }
  async function flip() {
    const room = roomRef.current; if (!room || !camOn) return;
    const next = facing === 'user' ? 'environment' : 'user';
    try {
      await room.localParticipant.setCameraEnabled(false);
      await room.localParticipant.setCameraEnabled(true, { facingMode: next });
      setFacing(next);
      const { Track } = await import('livekit-client');
      room.localParticipant.getTrackPublication(Track.Source.Camera)?.videoTrack?.attach(localEl.current!);
    } catch { setNotice('Couldn’t switch cameras'); }
  }

  const connected = status === 'accepted' && remoteIn;
  const line = endedText
    || (reconnecting ? 'Reconnecting…'
      : connected && answeredAt ? formatDuration(now - Date.parse(answeredAt))
        : status === 'accepted' ? 'Connecting…'
          : call.role === 'caller' ? 'Calling…' : 'Connecting…');

  return (
    <div className={`call${video ? ' is-video' : ''}`} role="dialog" aria-modal="true" aria-label={`Call with ${call.person.name}`}>
      <div ref={audioBox} hidden />
      {video && <video ref={remoteEl} className={`call-remote${remoteVideo ? ' on' : ''}`} autoPlay playsInline />}
      {(!video || !remoteVideo) && (
        <div className="call-stage">
          <Avatar name={call.person.name} src={call.person.avatar_url} size={video ? 120 : 148} />
        </div>
      )}

      <header className="call-top">
        <h2>{call.person.name}</h2>
        <p role="status" aria-live="polite">{line}</p>
        {notice && !endedText && <p className="call-notice">{notice}</p>}
        {audioBlocked && !endedText && (
          <button type="button" className="call-enable" onClick={() => void roomRef.current?.startAudio().then(() => setAudioBlocked(false))}>Tap to hear the call</button>
        )}
      </header>

      {video && <video ref={localEl} className={`call-local${camOn ? ' on' : ''}`} autoPlay playsInline muted />}

      {!endedText && (
        <div className="call-buttons">
          <button type="button" className={`call-btn${micOn ? '' : ' off'}`} onClick={toggleMic} aria-pressed={!micOn} aria-label={micOn ? 'Mute microphone' : 'Unmute microphone'}>
            {micOn ? <Mic size={26} /> : <MicOff size={26} />}
          </button>
          {video && (
            <button type="button" className={`call-btn${camOn ? '' : ' off'}`} onClick={toggleCam} aria-pressed={!camOn} aria-label={camOn ? 'Turn camera off' : 'Turn camera on'}>
              {camOn ? <Video size={26} /> : <VideoOff size={26} />}
            </button>
          )}
          {video && camOn && (
            <button type="button" className="call-btn" onClick={flip} aria-label="Switch camera"><SwitchCamera size={26} /></button>
          )}
          <button type="button" className="call-btn decline" onClick={hangUp} aria-label="End call"><PhoneOff size={28} /></button>
        </div>
      )}
    </div>
  );
}
