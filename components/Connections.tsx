'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Search, Users } from 'lucide-react';
import { api } from '@/lib/supabase-browser';
import { useLiveRefresh } from '@/lib/use-live-refresh';
import Avatar from './Avatar';

type Person = { id: string; display_name: string; username: string | null; avatar_url: string | null };
type ConnectionsData = { people: Person[]; followerIds: string[]; followingIds: string[] };
export default function Connections() {
  const [data, setData] = useState<ConnectionsData | null>(null);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'search' | 'followers' | 'following'>('search');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const find = new URLSearchParams(window.location.search).get('find');
    if (find) setQuery(find);
  }, []);
  useEffect(() => {
    let active = true;
    if (!data) setLoading(true); setError('');
    const timer = setTimeout(() => {
      api<ConnectionsData>(`/api/people${tab === 'search' && query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''}`)
        .then(result => { if (active) setData(result); })
        .catch(e => { if (active) setError(e.message); })
        .finally(() => { if (active) setLoading(false); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [query, tab, revision]);
  useEffect(() => {
    const again = () => setRevision(x => x + 1);
    window.addEventListener('people-updated', again);
    return () => window.removeEventListener('people-updated', again);
  }, []);
  useLiveRefresh(['me', 'profiles'], () => setRevision(x => x + 1));
  async function act(id: string, action: string) {
    setBusy(true); setError('');
    try {
      await api(`/api/people/${id}`, { action });
      window.dispatchEvent(new Event('people-updated')); // refreshes this list and the recommendations
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  }
  const people = (data?.people ?? []).filter(p => tab === 'search' || (tab === 'followers' ? data?.followerIds : data?.followingIds)?.includes(p.id));
  return <section className="card card-pad stack-lg" aria-label="Connections">
    <h2>People</h2>
    <div className="segmented people-tabs" style={{ '--n': 3, '--i': ['search', 'followers', 'following'].indexOf(tab) } as React.CSSProperties} role="group" aria-label="People filters">
      <span className="segmented-thumb" />
      {(['search', 'followers', 'following'] as const).map(t => <button key={t} type="button" aria-pressed={tab === t} onClick={() => setTab(t)}>
        {t === 'search' ? 'Find' : t === 'followers' ? 'Followers' : 'Following'}
        {t !== 'search' && <span className="tab-count">{(t === 'followers' ? data?.followerIds.length : data?.followingIds.length) ?? 0}</span>}
      </button>)}
    </div>
    {tab === 'search' && <div className="field"><label className="label" htmlFor="people-search">Search by username</label><input id="people-search" className="input" placeholder="Enter a username" value={query} maxLength={25} onChange={e => setQuery(e.target.value)} /></div>}
    {error && <p className="alert alert-error" role="alert">{error}</p>}
    {loading ? <ul className="people-list" aria-busy="true" aria-label="Loading people">{[0, 1, 2].map(i => <li key={i} className="person-row"><div className="skeleton" style={{ width: 44, height: 44, borderRadius: '50%' }} /><div className="person-info"><div className="skeleton" style={{ height: 14, width: '40%' }} /><div className="skeleton" style={{ height: 12, width: '25%' }} /></div></li>)}</ul> : !people.length ? <div className="rec-empty">{tab === 'search' ? <Search size={22} /> : <Users size={22} />}<span>{tab === 'search' ? (query.trim() ? 'No one found with that username.' : 'Search for a username to find someone to follow.') : tab === 'followers' ? 'No followers yet. Share your username so people can find you.' : 'You’re not following anyone yet. Try the suggestions above.'}</span></div> : <ul className="people-list">
      {people.map(p => <li key={p.id} className="person-row">
        <Link href={`/u/${p.id}`} className="person-link" aria-label={`View ${p.display_name}’s profile`}>
          <Avatar name={p.display_name} src={p.avatar_url} size={48} />
          <div className="person-info"><strong>{p.display_name}</strong><span className="muted">{p.username ? `@${p.username}` : 'No username yet'}</span></div>
        </Link>
        <div className="row-actions">
          <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => act(p.id, data?.followingIds.includes(p.id) ? 'unfollow' : 'follow')}>{data?.followingIds.includes(p.id) ? 'Unfollow' : 'Follow'}</button>
          {tab === 'followers' && <button type="button" className="btn btn-danger btn-sm" disabled={busy} onClick={() => act(p.id, 'remove_follower')}>Remove follower</button>}
        </div>
      </li>)}
    </ul>}
  </section>;
}
