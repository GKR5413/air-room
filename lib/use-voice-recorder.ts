'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { MAX_VOICE_MS } from './chat-core';

const TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/ogg;codecs=opus'];

export interface Recording { dataUrl: string; durationMs: number }

/**
 * Record a voice message from the microphone. Works with whatever the browser supports
 * (WebM/Opus on Chrome, Android and Firefox; MP4/AAC on iPhone).
 */
export function useVoiceRecorder(onLimit?: () => void) {
  const [recording, setRecording] = useState(false);
  const [ms, setMs] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const ticker = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const limit = useRef(onLimit);
  limit.current = onLimit;

  const release = useCallback(() => {
    clearInterval(ticker.current);
    stream.current?.getTracks().forEach(t => t.stop());
    stream.current = null; recorder.current = null; chunks.current = [];
    setRecording(false); setMs(0);
  }, []);

  useEffect(() => release, [release]);

  /** Ask for the microphone and start. Throws a readable message if that isn't possible. */
  const start = useCallback(async () => {
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) throw new Error('Voice messages aren’t supported in this browser');
    let media: MediaStream;
    try { media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch { throw new Error('Allow microphone access to record a voice message'); }
    const mimeType = TYPES.find(t => MediaRecorder.isTypeSupported(t));
    const rec = new MediaRecorder(media, mimeType ? { mimeType, audioBitsPerSecond: 24000 } : undefined);
    stream.current = media; recorder.current = rec; chunks.current = [];
    rec.ondataavailable = e => { if (e.data.size) chunks.current.push(e.data); };
    rec.start(250);
    startedAt.current = Date.now();
    setRecording(true);
    ticker.current = setInterval(() => {
      const elapsed = Date.now() - startedAt.current;
      setMs(elapsed);
      if (elapsed >= MAX_VOICE_MS) limit.current?.();
    }, 200);
  }, []);

  /** Stop and return what was recorded, or null if nothing usable came out. */
  const stop = useCallback((): Promise<Recording | null> => new Promise(resolve => {
    const rec = recorder.current;
    if (!rec) { resolve(null); return; }
    const durationMs = Date.now() - startedAt.current;
    rec.onstop = () => {
      const type = rec.mimeType || (chunks.current[0]?.type ?? 'audio/mp4');
      const blob = new Blob(chunks.current, { type });
      release();
      if (!blob.size) { resolve(null); return; }
      const reader = new FileReader();
      reader.onload = () => resolve({ dataUrl: String(reader.result), durationMs });
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    };
    try { rec.stop(); } catch { release(); resolve(null); }
  }), [release]);

  const cancel = useCallback(() => {
    const rec = recorder.current;
    if (rec) { rec.onstop = null; try { rec.stop(); } catch { /* already stopped */ } }
    release();
  }, [release]);

  return { recording, ms, start, stop, cancel };
}
