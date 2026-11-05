'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { Phone, PhoneOff, Video } from 'lucide-react';
import { api, supabase } from '@/lib/supabase-browser';
import { useChatLive } from '@/lib/use-chat-live';
import type { CallView } from '@/lib/chat-types';
import type { CallKind } from '@/lib/chat-core';
import Avatar from './Avatar';
import { useToast } from './Providers';
import { useRoomSession } from './RoomSession';

// livekit-client is ~150 kB: only fetched once a call actually starts.
const CallScreen = dynamic(() => import('./CallScreen'), { ssr: false });

type CallApi = { startCall: (conversationId: string, kind: CallKind) => Promise<void>; inCall: boolean };
const Ctx = createContext<CallApi>({ startCall: async () => {}, inCall: false });
export const useCall = () => useContext(Ctx);

/** A soft two-beep ring and a buzz while a call is ringing (best effort: browsers may block sound until you've tapped the page). */
function useRingtone(on: boolean) {
  useEffect(() => {
    if (!on) return;
    let ctx: AudioContext | null = null;
    const beep = () => {
      try {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        ctx ??= new AC();
        if (ctx.state === 'suspended') void ctx.resume();
        const t = ctx.currentTime;
        [0, 0.45].forEach(offset => {
          const osc = ctx!.createOscillator(), gain = ctx!.createGain();
          osc.frequency.value = 523; osc.connect(gain); gain.connect(ctx!.destination);
          gain.gain.setValueAtTime(0.0001, t + offset);
          gain.gain.exponentialRampToValueAtTime(0.16, t + offset + 0.05);
          gain.gain.exponentialRampToValueAtTime(0.0001, t + offset + 0.35);
          osc.start(t + offset); osc.stop(t + offset + 0.4);
        });
      } catch { /* sound unavailable */ }
      try { navigator.vibrate?.([250, 150, 250]); } catch { /* not supported */ }
    };
    beep();
    const timer = setInterval(beep, 2400);
    return () => { clearInterval(timer); ctx?.close().catch(() => {}); try { navigator.vibrate?.(0); } catch { /* not supported */ } };
  }, [on]);
}

/**
 * Lives in the root layout so a call can reach you on any page. Shows the ringing screen for an
 * incoming call and the full-screen call while one is on. Rooms and calls don't mix: starting or
 * answering a call leaves the room you're in.
 */
export default function CallProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const session = useRoomSession();
  const [signedIn, setSignedIn] = useState(false);
  const [active, setActive] = useState<CallView | null>(null);
  const [incoming, setIncoming] = useState<CallView | null>(null);
  const [busy, setBusy] = useState(false);
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    let live = true;
    supabase.auth.getSession().then(({ data }) => { if (live) setSignedIn(!!data.session); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSignedIn(!!s));
    return () => { live = false; data.subscription.unsubscribe(); };
  }, []);

  const check = useCallback(async () => {
    try {
      const r = await api<{ incoming: CallView | null; active: CallView | null }>('/api/chat/calls');
      if (!activeRef.current && r.active) setActive(r.active); // a call you were in before a refresh
      setIncoming(activeRef.current ? null : r.incoming);
    } catch { /* offline or chat not set up: nothing to ring */ }
  }, []);
  useChatLive(check, 6000, signedIn);
  useEffect(() => { if (signedIn) void check(); }, [signedIn, check]); // a call may already be ringing when you open the app

  useRingtone(!!incoming && !active);

  const startCall = useCallback(async (conversationId: string, kind: CallKind) => {
    if (activeRef.current) { toast('You’re already in a call', 'error'); return; }
    try {
      const r = await api<{ call: CallView }>('/api/chat/calls', { conversationId, kind });
      session.leave(); // a call and a room can't share the microphone
      setIncoming(null);
      setActive(r.call);
    } catch (e: any) { toast(e.message || 'Could not start the call', 'error'); }
  }, [session, toast]);

  async function answer(accept: boolean) {
    if (!incoming || busy) return;
    setBusy(true);
    try {
      const r = await api<{ call: CallView }>(`/api/chat/calls/${incoming.id}`, { action: accept ? 'accept' : 'decline' });
      setIncoming(null);
      if (accept) {
        if (r.call.status === 'accepted') { session.leave(); setActive(r.call); }
        else toast('That call has already ended', 'info');
      }
    } catch (e: any) { toast(e.message || 'Could not answer', 'error'); setIncoming(null); }
    finally { setBusy(false); }
  }

  const value = useMemo<CallApi>(() => ({ startCall, inCall: !!active }), [startCall, active]);

  return (
    <Ctx.Provider value={value}>
      {children}

      {incoming && !active && (
        <div className="incoming" role="alertdialog" aria-modal="true" aria-label={`Incoming call from ${incoming.person.name}`}>
          <div className="incoming-who">
            <Avatar name={incoming.person.name} src={incoming.person.avatar_url} size={132} />
            <h2>{incoming.person.name}</h2>
            <p>Incoming {incoming.kind === 'video' ? 'video' : 'voice'} call…</p>
          </div>
          <div className="call-buttons">
            <button type="button" className="call-btn decline" onClick={() => answer(false)} disabled={busy} aria-label="Decline call"><PhoneOff size={28} /></button>
            <button type="button" className="call-btn accept" onClick={() => answer(true)} disabled={busy} aria-label={incoming.kind === 'video' ? 'Answer with video' : 'Answer call'}>
              {incoming.kind === 'video' ? <Video size={28} /> : <Phone size={28} />}
            </button>
          </div>
        </div>
      )}

      {active && <CallScreen key={active.id} call={active} onClose={() => { setActive(null); void check(); }} />}
    </Ctx.Provider>
  );
}
