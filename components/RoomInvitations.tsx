'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { BellRing, X } from 'lucide-react';
import { api, supabase } from '@/lib/supabase-browser';
import { useLiveRefresh } from '@/lib/use-live-refresh';
import { useRoomSession } from './RoomSession';
import { useCall } from './CallProvider';
import { useToast } from './Providers';
import Avatar from './Avatar';

export type RoomInvitation = {
  id: string; created_at: string;
  room: { slug: string; title: string };
  sender?: { display_name: string; avatar_url: string | null };
};
type Inbox = {
  invitations: RoomInvitation[] | null; error: string; needsLogin: boolean; busy: boolean;
  refresh(): Promise<void>;
  respond(invitation: RoomInvitation, action: 'accept' | 'dismiss'): Promise<void>;
};
const Context = createContext<Inbox | null>(null);
export function useRoomInvitations() {
  const inbox = useContext(Context);
  if (!inbox) throw new Error('RoomInvitationsProvider is required');
  return inbox;
}

/** One private inbox subscription shared by the badge, inbox and in-app alerts. */
export default function RoomInvitationsProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const session = useRoomSession();
  const { inCall } = useCall();
  const toast = useToast();
  const [userId, setUserId] = useState<string | null | undefined>(undefined);
  const [invitations, setInvitations] = useState<RoomInvitation[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const busyRef = useRef(false);
  const revision = useRef(0);
  const currentUser = useRef(userId);
  currentUser.current = userId;

  useEffect(() => {
    let active = true;
    const update = (id: string | null) => { if (active) setUserId(id); };
    void supabase.auth.getSession().then(({ data }) => update(data.session?.user.id ?? null));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => update(s?.user.id ?? null));
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);

  const refresh = useCallback(async () => {
    const id = currentUser.current;
    if (!id) return;
    const request = ++revision.current;
    try {
      const result = await api<{ invitations: RoomInvitation[] }>('/api/invitations');
      if (currentUser.current === id && revision.current === request) {
        setInvitations(result.invitations); setError('');
      }
    } catch (e: any) {
      if (currentUser.current === id && revision.current === request) setError(e.message || 'Could not load invitations');
    }
  }, []);
  useEffect(() => {
    ++revision.current;
    setInvitations(userId ? null : []); setError(''); setHidden(new Set());
    if (userId) void refresh();
  }, [userId, refresh]);
  useLiveRefresh(['me', 'hallway', 'profiles'], refresh, 5000);

  const respond = useCallback(async (invitation: RoomInvitation, action: 'accept' | 'dismiss') => {
    if (busyRef.current) return;
    if (action === 'accept' && inCall) { toast('End your call before joining a room.', 'info'); return; }
    busyRef.current = true; setBusy(true); setError('');
    try {
      const accept = async () => {
        await api(`/api/invitations/${invitation.id}`, { action });
        ++revision.current; // ignore inbox responses started before this action
        setInvitations(previous => previous?.filter(i => i.id !== invitation.id) ?? []);
      };
      if (action === 'accept') {
        if (await session.join(invitation.room.slug, accept)) router.push(`/r/${invitation.room.slug}`);
      } else await accept();
    } catch (e: any) {
      toast(e.message || 'Could not respond to invitation', 'error');
      await refresh(); // remove invitations for rooms that ended or revoked access
    } finally { busyRef.current = false; setBusy(false); }
  }, [inCall, refresh, router, session, toast]);

  const value = useMemo<Inbox>(() => ({ invitations, error, needsLogin: userId === null, busy, refresh, respond }), [invitations, error, userId, busy, refresh, respond]);
  const incoming = userId && path !== '/invitations'
    ? invitations?.find(i => !hidden.has(i.id) && i.room.slug !== session.slug)
    : null;
  return <Context.Provider value={value}>
    {children}
    {incoming && <aside className="room-ping card" aria-label="Room invitation">
      <div className="room-ping-message" role="status">
        <Avatar name={incoming.sender?.display_name ?? 'Friend'} src={incoming.sender?.avatar_url} size={40} />
        <div className="room-ping-copy"><span><strong>{incoming.sender?.display_name ?? 'A friend'}</strong> invited you to join</span><b>{incoming.room.title}</b></div>
      </div>
      <div className="room-ping-actions">
        <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void respond(incoming, 'accept')}><BellRing size={16} />Join</button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void respond(incoming, 'dismiss')}>Dismiss</button>
        <button type="button" className="icon-btn" aria-label="Remind me later" onClick={() => setHidden(previous => new Set([...previous, incoming.id]))}><X size={18} /></button>
      </div>
    </aside>}
  </Context.Provider>;
}
