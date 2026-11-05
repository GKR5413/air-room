'use client';
import { useEffect, useRef } from 'react';
import { supabase } from './supabase-browser';

/**
 * Live updates for chat. The database sends an empty "something changed" signal on your private
 * channel (airroom:chat:<your id>); every screen that cares re-fetches through the authorized API.
 * One shared subscription serves all of them, and polling covers the gaps if Realtime is down.
 */
type Listener = () => void;
const listeners = new Set<Listener>();
let current: { uid: string; channel: ReturnType<typeof supabase.channel> } | null = null;
let authWatch: { unsubscribe(): void } | null = null;
let revision = 0;

async function sync() {
  const mine = ++revision;
  const { data } = await supabase.auth.getSession();
  if (mine !== revision) return;
  const uid = listeners.size ? data.session?.user.id ?? null : null;
  if (current?.uid === uid) return;
  if (current) { void supabase.removeChannel(current.channel); current = null; }
  if (!uid) return;
  const channel = supabase.channel(`airroom:chat:${uid}`, { config: { private: true } })
    .on('broadcast', { event: 'change' }, () => listeners.forEach(fn => fn()))
    .subscribe(status => { if (status === 'SUBSCRIBED') listeners.forEach(fn => fn()); });
  current = { uid, channel };
}

export function useChatLive(refresh: () => unknown, fallbackMs = 20000, enabled = true) {
  const latest = useRef(refresh);
  latest.current = refresh;
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = () => { clearTimeout(timer); timer = setTimeout(() => { void latest.current(); }, 120); };
    const visible = () => { if (document.visibilityState === 'visible') run(); };
    listeners.add(run);
    if (!authWatch) authWatch = supabase.auth.onAuthStateChange(() => { setTimeout(() => { void sync(); }, 0); }).data.subscription;
    void sync();
    const interval = setInterval(visible, fallbackMs);
    window.addEventListener('focus', run);
    window.addEventListener('online', run);
    document.addEventListener('visibilitychange', visible);
    return () => {
      clearTimeout(timer); clearInterval(interval);
      window.removeEventListener('focus', run); window.removeEventListener('online', run);
      document.removeEventListener('visibilitychange', visible);
      listeners.delete(run);
      if (!listeners.size) { authWatch?.unsubscribe(); authWatch = null; void sync(); }
    };
  }, [fallbackMs, enabled]);
}
