'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Lock, Search, Users } from 'lucide-react';
import { api } from '@/lib/supabase-browser';
import Avatar from '@/components/Avatar';
import RoomCard, { type RoomItem } from '@/components/RoomCard';

type Person = { id: string; display_name: string; username: string | null; avatar_url: string | null };

/** Find people by username and live rooms by title, host or topic. */
export default function SearchPage() {
  const [q, setQ] = useState('');
  const [people, setPeople] = useState<Person[] | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [rooms, setRooms] = useState<RoomItem[]>([]);
  const needle = q.trim().toLowerCase().replace(/^@/, '');

  useEffect(() => { api<{ rooms: RoomItem[] }>('/api/rooms').then(r => setRooms(r.rooms)).catch(() => {}); }, []);

  useEffect(() => {
    if (!needle || !/^[a-z0-9_]{1,24}$/.test(needle)) { setPeople(null); return; }
    let live = true;
    const timer = setTimeout(() => {
      api<{ people: Person[] }>(`/api/people?q=${encodeURIComponent(needle)}`)
        .then(r => { if (live) { setPeople(r.people); setNeedsLogin(false); } })
        .catch(e => { if (!live) return; if (/sign in/i.test(e.message)) setNeedsLogin(true); setPeople([]); });
    }, 250);
    return () => { live = false; clearTimeout(timer); };
  }, [needle]);

  const matchingRooms = useMemo(
    () => needle ? rooms.filter(r => [r.title, r.host_name, r.topic].some(s => s?.toLowerCase().includes(needle))) : [],
    [rooms, needle],
  );

  return (
    <main className="container feed">
      <h1 className="sr-only">Search</h1>
      <label className="searchbar input-wrap">
        <span className="sr-only">Search people and rooms</span>
        <Search className="lead" aria-hidden="true" />
        <input className="input" type="search" placeholder="Search people and rooms" value={q} onChange={e => setQ(e.target.value)} autoFocus />
      </label>

      {!needle && (
        <div className="empty rise">
          <span className="empty-ico"><Users size={24} /></span>
          <h3 className="display">Find people</h3>
          <p className="muted">Search a username, or a room title or topic.</p>
        </div>
      )}

      {needLoginNote(needsLogin)}

      {!!people?.length && (
        <section aria-label="People">
          <h2 className="sub-head">People</h2>
          <ul className="people-list">
            {people.map(p => (
              <li key={p.id}>
                <Link href={`/u/${p.id}`} className="person-row">
                  <Avatar name={p.display_name} src={p.avatar_url} size={48} />
                  <div className="person-info"><strong>{p.display_name}</strong><span className="muted">{p.username ? `@${p.username}` : 'No username yet'}</span></div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {matchingRooms.length > 0 && (
        <section aria-label="Rooms">
          <h2 className="sub-head">Live rooms</h2>
          <ul className="feed-list">{matchingRooms.map(r => <li key={r.slug}><RoomCard room={r} /></li>)}</ul>
        </section>
      )}

      {needle && people?.length === 0 && !needsLogin && matchingRooms.length === 0 && (
        <div className="empty rise"><h3 className="display">No results</h3><p className="muted">Try another name or topic.</p></div>
      )}
    </main>
  );
}

function needLoginNote(show: boolean) {
  if (!show) return null;
  return (
    <div className="card card-pad gate rise">
      <span className="empty-ico"><Lock size={24} /></span>
      <h2 className="display">Sign in to find people</h2>
      <Link href="/login" className="btn btn-primary">Sign in</Link>
    </div>
  );
}
