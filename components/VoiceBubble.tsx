'use client';
import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, Pause, Play } from 'lucide-react';
import { authHeaders } from '@/lib/supabase-browser';
import { formatDuration } from '@/lib/chat-core';

/** A voice message: tap to play. The audio is fetched with your sign-in the first time you press play. */
export default function VoiceBubble({ id, durationMs, pending = false }: { id: string; durationMs: number; pending?: boolean }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const url = useRef<string | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'playing' | 'paused' | 'error'>('idle');
  const [progress, setProgress] = useState(0);

  useEffect(() => () => {
    audio.current?.pause();
    if (url.current) URL.revokeObjectURL(url.current);
  }, []);

  async function toggle() {
    if (pending) return;
    if (audio.current && state === 'playing') { audio.current.pause(); return; }
    if (audio.current) { await audio.current.play().catch(() => setState('error')); return; }
    setState('loading');
    try {
      const res = await fetch(`/api/chat/media/${id}`, { headers: await authHeaders() });
      if (!res.ok) throw new Error('unavailable');
      url.current = URL.createObjectURL(await res.blob());
      const el = new Audio(url.current);
      el.onplay = () => setState('playing');
      el.onpause = () => setState(s => (s === 'error' ? s : 'paused'));
      el.onended = () => { setState('idle'); setProgress(0); audio.current = null; };
      el.ontimeupdate = () => setProgress(el.duration ? el.currentTime / el.duration : 0);
      audio.current = el;
      await el.play();
    } catch { audio.current = null; setState('error'); }
  }

  const busy = pending || state === 'loading';
  return (
    <div className="vbubble">
      <button type="button" className="vplay" onClick={toggle} disabled={pending} aria-label={state === 'playing' ? 'Pause voice message' : 'Play voice message'}>
        {busy ? <LoaderCircle size={20} className="spin" /> : state === 'playing' ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
      </button>
      <div className="vtrack" aria-hidden="true"><i style={{ width: `${Math.round(progress * 100)}%` }} /></div>
      <span className="vtime">{state === 'error' ? 'Can’t play' : pending ? 'Sending…' : formatDuration(durationMs)}</span>
    </div>
  );
}
