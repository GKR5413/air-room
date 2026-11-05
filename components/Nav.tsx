'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { House, Mail, MessageCircle, Plus, Search, UserRound } from 'lucide-react';
import { api, supabase } from '@/lib/supabase-browser';
import { useLiveRefresh } from '@/lib/use-live-refresh';
import { useChatLive } from '@/lib/use-chat-live';
import Avatar from './Avatar';
import { Brand } from './Logo';
import ThemeToggle from './ThemeToggle';
import { useRoomInvitations } from './RoomInvitations';

type Who = { name: string; avatar_url?: string | null } | null;

export default function Nav() {
  const path = usePathname();
  const [who, setWho] = useState<Who | undefined>(undefined);
  const { invitations } = useRoomInvitations();
  const invites = invitations?.length ?? 0;
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let active = true;
    let revision = 0;
    const refresh = async () => {
      const current = ++revision;
      const { data } = await supabase.auth.getSession();
      if (!active || current !== revision) return;
      if (!data.session) { setWho(null); return; }
      const user = data.session.user;
      setWho(current => current ?? { name: user.user_metadata?.display_name || user.email?.split('@')[0] || 'You' });
      try {
        const { profile } = await api('/api/me');
        if (active && current === revision) setWho({ name: profile.display_name, avatar_url: profile.avatar_url });
      } catch { /* Keep the signed-in fallback if profile is unavailable. */ }
    };
    void refresh();
    const { data: sub } = supabase.auth.onAuthStateChange(() => { setTimeout(() => { void refresh(); }, 0); });
    window.addEventListener('profile-updated', refresh);

    return () => { active = false; sub.subscription.unsubscribe(); window.removeEventListener('profile-updated', refresh); };
  }, []);

  useLiveRefresh(['me', 'profiles'], () => window.dispatchEvent(new Event('profile-updated')));

  // Unread messages for the badge on the Messages tab.
  const loadUnread = useCallback(async () => {
    try { setUnread((await api<{ count: number }>('/api/chat/unread')).count); } catch { setUnread(0); }
  }, []);
  useEffect(() => { if (who) void loadUnread(); else setUnread(0); }, [who, path, loadUnread]);
  useChatLive(loadUnread, 30000, !!who);

  const on = (p: string) => (path === p ? 'page' : undefined);

  return (
    <>
      <header className="site-nav">
        <div className="container site-nav-inner">
          <Link href="/" className="brand" aria-label="AirRoom home"><Brand /></Link>
          <div className="nav-spacer" />
          <ThemeToggle />
          {who === undefined ? (
            <span className="nav-slot" aria-hidden="true" />
          ) : who ? (
            <Link href="/me" className="nav-me" aria-label={`Your profile: ${who.name}`} title={who.name}>
              <Avatar name={who.name} src={who.avatar_url} size={40} />
            </Link>
          ) : (
            <Link href="/login" className="btn btn-primary btn-sm">Sign in</Link>
          )}
        </div>
      </header>

      {/* Host a room, always one tap away on the feed. */}
      {path === '/' && (
        <Link href="/create" className="fab btn btn-primary btn-lg"><Plus size={22} strokeWidth={2.6} /><span>host a room</span></Link>
      )}

      <nav className="tabbar" aria-label="Primary">
        <Link href="/" className="tab tab-home" aria-label="Home" aria-current={on('/')}><House /></Link>
        <Link href="/search" className="tab" aria-label="Search" aria-current={on('/search')}><Search /></Link>
        <Link href="/messages" className="tab" aria-label={unread ? `Messages, ${unread} unread` : 'Messages'} aria-current={path.startsWith('/messages') ? 'page' : undefined}>
          <MessageCircle />{unread > 0 && <b className="tab-badge">{unread > 9 ? '9+' : unread}</b>}
        </Link>
        <Link href="/invitations" className="tab" aria-label={invites ? `Invitations, ${invites} new` : 'Invitations'} aria-current={on('/invitations')}>
          <Mail />{invites > 0 && <b className="tab-badge">{invites > 9 ? '9+' : invites}</b>}
        </Link>
        <Link href={who ? '/me' : '/login'} className="tab" aria-label={who ? 'Profile' : 'Sign in'} aria-current={path === '/me' || path === '/login' ? 'page' : undefined}>
          {who ? <Avatar name={who.name} src={who.avatar_url} size={30} /> : <UserRound />}
        </Link>
      </nav>
    </>
  );
}
