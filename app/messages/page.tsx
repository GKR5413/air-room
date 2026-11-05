'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CircleAlert, Lock, MessageCirclePlus, MessagesSquare, Search, Users } from 'lucide-react';
import { api, supabase } from '@/lib/supabase-browser';
import { useChatLive } from '@/lib/use-chat-live';
import { listTime, type ChatPerson, type ConversationItem } from '@/lib/chat-types';
import Avatar from '@/components/Avatar';
import Modal from '@/components/Modal';
import { useToast } from '@/components/Providers';

type Friend = ChatPerson & { conversationId: string | null };

/** Your conversations, and the friends (people who follow each other) you can start one with. */
export default function Messages() {
  const router = useRouter();
  const toast = useToast();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [convos, setConvos] = useState<ConversationItem[] | null>(null);
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [error, setError] = useState('');
  const [pickOpen, setPickOpen] = useState(false);
  const [q, setQ] = useState('');
  const [opening, setOpening] = useState<string | null>(null);

  useEffect(() => { supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session)); }, []);

  const load = useCallback(async () => {
    try {
      const [c, f] = await Promise.all([
        api<{ conversations: ConversationItem[] }>('/api/chat/conversations'),
        api<{ friends: Friend[] }>('/api/chat/friends'),
      ]);
      setConvos(c.conversations); setFriends(f.friends); setError('');
    } catch (e: any) {
      if (/sign in/i.test(e.message)) setSignedIn(false); else setError(e.message);
    }
  }, []);
  useEffect(() => { if (signedIn) void load(); }, [signedIn, load]);
  useChatLive(load, 15000, !!signedIn);

  async function open(f: Friend) {
    if (f.conversationId) { router.push(`/messages/${f.conversationId}`); return; }
    setOpening(f.id);
    try {
      const { id } = await api<{ id: string }>('/api/chat/conversations', { userId: f.id });
      router.push(`/messages/${id}`);
    } catch (e: any) { toast(e.message || 'Could not open the chat', 'error'); setOpening(null); }
  }

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase().replace(/^@/, '');
    return (friends ?? []).filter(f => !needle || f.name.toLowerCase().includes(needle) || f.username?.includes(needle));
  }, [friends, q]);

  if (signedIn === false) {
    return (
      <main className="container mid page">
        <div className="card card-pad gate rise">
          <span className="empty-ico"><Lock size={24} /></span>
          <h1 className="display">Sign in to message</h1>
          <p className="muted">Chat with people who follow you back.</p>
          <Link href="/login" className="btn btn-primary btn-lg">Sign in</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="container feed">
      <header className="msg-head">
        <h1 className="display">messages</h1>
        <button type="button" className="icon-btn round" onClick={() => setPickOpen(true)} aria-label="New message" disabled={!friends?.length}>
          <MessageCirclePlus size={24} />
        </button>
      </header>

      {error && (
        <div className="alert alert-error" role="alert"><CircleAlert /><span style={{ flex: 1 }}>{error}</span>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => void load()}>Retry</button></div>
      )}

      {!!friends?.length && (
        <section aria-label="Friends">
          <ul className="friends-row">
            {friends.slice(0, 24).map(f => (
              <li key={f.id}>
                <button type="button" className="friend" onClick={() => void open(f)} disabled={opening === f.id} aria-label={`Message ${f.name}`}>
                  <Avatar name={f.name} src={f.avatar_url} size={64} />
                  <span>{f.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!convos && !error && (
        <ul className="convo-list" aria-busy="true" aria-label="Loading chats">
          {[0, 1, 2, 3].map(i => (
            <li key={i} className="convo"><div className="skeleton" style={{ width: 56, height: 56, borderRadius: '36%' }} />
              <div className="convo-text"><div className="skeleton" style={{ height: 14, width: '35%' }} /><div className="skeleton" style={{ height: 14, width: '70%', marginTop: 8 }} /></div></li>
          ))}
        </ul>
      )}

      {!!convos?.length && (
        <ul className="convo-list">
          {convos.map(c => (
            <li key={c.id}>
              <Link href={`/messages/${c.id}`} className={`convo${c.unread ? ' unread' : ''}`}>
                <Avatar name={c.person.name} src={c.person.avatar_url} size={56} />
                <div className="convo-text">
                  <div className="convo-top"><strong>{c.person.name}</strong><time dateTime={c.last.at}>{listTime(c.last.at)}</time></div>
                  <p className="convo-preview">{c.last.mine && '↩ '}{c.last.preview}</p>
                </div>
                {c.unread > 0 && <b className="unread-badge" aria-label={`${c.unread} unread`}>{c.unread > 99 ? '99+' : c.unread}</b>}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {convos && !convos.length && !error && (
        <div className="empty rise">
          <span className="empty-ico">{friends?.length ? <MessagesSquare size={24} /> : <Users size={24} />}</span>
          <h3 className="display">{friends?.length ? 'No messages yet' : 'No friends to message yet'}</h3>
          <p className="muted">{friends?.length ? 'Tap a friend above to say hi.' : 'You can chat with people once you both follow each other.'}</p>
          {!friends?.length && <Link href="/search" className="btn btn-outline"><Search size={16} />Find people</Link>}
        </div>
      )}

      <Modal open={pickOpen} onClose={() => { setPickOpen(false); setQ(''); }} title="New message">
        <label className="searchbar input-wrap" style={{ margin: 0 }}>
          <span className="sr-only">Search friends</span>
          <Search className="lead" aria-hidden="true" />
          <input className="input" type="search" placeholder="Search friends" value={q} onChange={e => setQ(e.target.value)} autoFocus />
        </label>
        <ul className="people-list pick-list">
          {matches.map(f => (
            <li key={f.id}>
              <button type="button" className="person-row pick-row" onClick={() => void open(f)} disabled={opening === f.id}>
                <Avatar name={f.name} src={f.avatar_url} size={48} />
                <div className="person-info"><strong>{f.name}</strong><span className="muted">{f.username ? `@${f.username}` : ''}</span></div>
              </button>
            </li>
          ))}
          {!matches.length && <li className="rec-empty">No friends match that.</li>}
        </ul>
      </Modal>
    </main>
  );
}
