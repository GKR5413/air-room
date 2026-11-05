'use client';
import { useEffect, useRef } from 'react';
import { supabase } from './supabase-browser';

type Listener = () => void;
const subscriptions = new Map<string, { listeners: Set<Listener>; channel: ReturnType<typeof supabase.channel> }>();
function listen(topic: string, listener: Listener) {
  let entry = subscriptions.get(topic);
  if (!entry) {
    const listeners = new Set<Listener>();
    const channel = supabase.channel(topic, { config: { private: true } })
      .on('broadcast', { event: 'change' }, () => listeners.forEach(fn => fn()))
      .subscribe(status => { if (status === 'SUBSCRIBED') listeners.forEach(fn => fn()); });
    entry = { listeners, channel };
    subscriptions.set(topic, entry);
  }
  entry.listeners.add(listener);
  return () => {
    entry.listeners.delete(listener);
    if (!entry.listeners.size) { subscriptions.delete(topic); void supabase.removeChannel(entry.channel); }
  };
}

/** Coalesce pushes, reconcile on reconnect/focus, and poll if Realtime is unavailable.
 * `me` resolves to a private channel authorized only for the signed-in user's JWT.
 * API responses remain the source of truth; no broadcast payload is trusted.
 */
export function useLiveRefresh(topics: string[], refresh: () => unknown, fallbackMs = 15000) {
  const callback = useRef(refresh);
  callback.current = refresh;
  const key = topics.join('|');
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let personal: (() => void) | undefined;
    let authRevision = 0;
    let inFlight = false;
    let pending = false;
    const execute = async () => {
      if (stopped) return;
      if (inFlight) { pending = true; return; }
      inFlight = true;
      try { await callback.current(); } catch { /* Each view owns its error presentation. */ }
      finally {
        inFlight = false;
        if (pending && !stopped) { pending = false; void execute(); }
      }
    };
    const run = () => {
      if (stopped) return;
      clearTimeout(timer);
      timer = setTimeout(() => { void execute(); }, 100);
    };
    const names = key.split('|').filter(Boolean);
    const cleanups = names.filter(t => t !== 'me').map(topic => listen(`airroom:${topic}`, run));
    async function syncUser() {
      const revision = ++authRevision;
      const { data } = await supabase.auth.getSession();
      if (stopped || revision !== authRevision) return;
      personal?.(); personal = undefined;
      if (data.session) personal = listen(`airroom:user:${data.session.user.id}`, run);
      run();
    }
    const auth = names.includes('me') ? supabase.auth.onAuthStateChange(() => { setTimeout(() => { if (!stopped) void syncUser(); }, 0); }).data.subscription : null;
    if (names.includes('me')) void syncUser();
    window.addEventListener('focus', run);
    window.addEventListener('online', run);
    const visible = () => { if (document.visibilityState === 'visible') run(); };
    document.addEventListener('visibilitychange', visible);
    const interval = setInterval(() => { if (document.visibilityState === 'visible') run(); }, fallbackMs);
    return () => {
      stopped = true; clearTimeout(timer); clearInterval(interval);
      cleanups.forEach(fn => fn()); personal?.(); auth?.unsubscribe();
      window.removeEventListener('focus', run); window.removeEventListener('online', run);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [key, fallbackMs]);
}
