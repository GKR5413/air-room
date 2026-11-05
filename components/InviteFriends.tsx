'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/supabase-browser';
import { useLiveRefresh } from '@/lib/use-live-refresh';
import Avatar from './Avatar';
import Modal from './Modal';

type Friend = { id: string; display_name: string; username: string | null; avatar_url: string | null; invited: boolean };
export default function InviteFriends({ slug, onClose }: { slug: string; onClose: () => void }) {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    api<{ friends: Friend[]; hasMore: boolean }>(`/api/rooms/${slug}/friends?page=${page}`)
      .then(result => {
        if (!active) return;
        setFriends(previous => page ? [...previous.filter(p => !result.friends.some(f => f.id === p.id)), ...result.friends] : result.friends);
        setHasMore(result.hasMore);
      })
      .catch(e => { if (active) setError(e.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [slug, page, retry]);
  useLiveRefresh(['me', 'profiles', `room:${slug}`], () => setRetry(n => n + 1));
  async function invite(friend: Friend) {
    setBusy(true); setError(''); setMessage('');
    try {
      await api(`/api/rooms/${slug}/friends`, { recipientId: friend.id });
      setFriends(previous => previous.map(f => f.id === friend.id ? { ...f, invited: true } : f));
      setMessage(`Ping sent to ${friend.display_name}. They’ll get a notification with a Join button.`);
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  }
  const shown = friends.filter(f => `${f.display_name} ${f.username ?? ''}`.toLowerCase().includes(search.toLowerCase()));
  return <Modal open onClose={onClose} title="Ping people" description="People you follow will get an in-app invitation with your name and a button to join this room." actions={<button type="button" className="btn btn-outline" onClick={onClose}>Done</button>}>
    <div className="stack">
      <label className="label" htmlFor="friend-search">Find a friend</label>
      <input id="friend-search" className="input" value={search} onChange={e => setSearch(e.target.value)} placeholder="Name or username" />
      {error && <div role="alert" className="alert alert-error">{error}<button type="button" className="btn btn-sm btn-ghost" disabled={loading} onClick={() => setRetry(n => n + 1)}>Retry list</button></div>}
      {message && <p role="status" className="alert alert-ok">{message}</p>}
      <ul className="people-list">
        {shown.map(f => <li className="person-row" key={f.id}>
          <Avatar name={f.display_name} src={f.avatar_url} size={40} />
          <div className="person-info"><strong>{f.display_name}</strong>{f.username && <span className="muted">@{f.username}</span>}</div>
          <button type="button" className="btn btn-primary btn-sm" disabled={busy || f.invited} onClick={() => invite(f)}>{f.invited ? 'Pinged' : 'Ping'}</button>
        </li>)}
      </ul>
      {loading && <p role="status" className="muted">Loading friends…</p>}
      {!loading && !shown.length && <p className="muted">{friends.length ? 'No matching friends on this page.' : 'Follow people from your profile to invite them here.'}</p>}
      {hasMore && <button type="button" className="btn btn-outline" disabled={loading} onClick={() => setPage(n => n + 1)}>Load more friends</button>}
    </div>
  </Modal>;
}
