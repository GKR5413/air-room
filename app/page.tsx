'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AudioLines, CircleAlert, RefreshCw, Sparkles } from 'lucide-react';
import { api } from '@/lib/supabase-browser';
import { useLiveRefresh } from '@/lib/use-live-refresh';
import RoomCard, { type RoomItem } from '@/components/RoomCard';

export default function Explore() {
  const [rooms, setRooms] = useState<RoomItem[] | null>(null);
  const [error, setError] = useState('');
  const [topic, setTopic] = useState('all');

  const load = useCallback(() => {
    return api<{ rooms: RoomItem[] }>('/api/rooms')
      .then(r => { setRooms(r.rooms); setError(''); })
      .catch(e => setError(e.message));
  }, []);

  useEffect(() => { void load(); }, [load]);
  useLiveRefresh(['hallway', 'profiles'], load, 5000);

  const topics = useMemo(
    () => Array.from(new Set((rooms ?? []).map(r => r.topic).filter(Boolean))).slice(0, 12),
    [rooms],
  );
  // A topic can disappear when its last room ends; fall back to everything.
  const active = topics.includes(topic) ? topic : 'all';

  const shown = useMemo(
    () => (rooms ?? []).filter(r => active === 'all' || r.topic === active).sort((a, b) => b.audience - a.audience),
    [rooms, active],
  );

  return (
    <main className="container feed">
      <h1 className="sr-only">Live rooms</h1>

      <div className="pills" role="group" aria-label="Filter by topic">
        <button type="button" className="pill" aria-pressed={active === 'all'} onClick={() => setTopic('all')}>
          <Sparkles size={18} />for you
        </button>
        {topics.map(t => (
          <button key={t} type="button" className="pill" aria-pressed={active === t} onClick={() => setTopic(active === t ? 'all' : t)}>{t}</button>
        ))}
      </div>

      {error && !rooms && (
        <div className="alert alert-error" role="alert">
          <CircleAlert />
          <div style={{ flex: 1 }}>
            <strong>Couldn’t load rooms.</strong>
            <div className="muted">{error}</div>
          </div>
          <button type="button" className="btn btn-outline btn-sm" onClick={load}><RefreshCw size={14} />Retry</button>
        </div>
      )}

      {!rooms && !error && (
        <ul className="feed-list" aria-busy="true" aria-label="Loading rooms">
          {Array.from({ length: 4 }, (_, i) => (
            <li key={i} className="feed-card skeleton-card">
              <div className="fc-main">
                <div className="skeleton" style={{ height: 18, width: '40%' }} />
                <div className="skeleton" style={{ height: 26, width: '80%', marginTop: 12 }} />
              </div>
              <div className="skeleton" style={{ height: 96, width: 110, borderRadius: 30 }} />
            </li>
          ))}
        </ul>
      )}

      {rooms && shown.length > 0 && (
        <ul className="feed-list">
          {shown.map((r, i) => <li key={r.slug}><RoomCard room={r} index={Math.min(i, 8)} /></li>)}
        </ul>
      )}

      {rooms && shown.length === 0 && (
        <div className="empty rise">
          <span className="empty-ico"><AudioLines size={24} /></span>
          <h3 className="display">{active === 'all' ? 'No one is live' : 'Nothing here yet'}</h3>
          <p className="muted">{active === 'all' ? 'Host a room and others can drop in.' : 'Try another topic.'}</p>
          {active !== 'all' && <button type="button" className="btn btn-outline" onClick={() => setTopic('all')}>Show all</button>}
          {active === 'all' && <Link href="/create" className="btn btn-primary">Host a room</Link>}
        </div>
      )}
    </main>
  );
}
