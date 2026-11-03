'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, AudioLines, CircleAlert, Plus, Radio, RefreshCw, Search, X } from 'lucide-react';
import { api } from '@/lib/supabase-browser';
import { plural } from '@/lib/format';
import RoomCard, { type RoomItem } from '@/components/RoomCard';

export default function Explore() {
  const [rooms, setRooms] = useState<RoomItem[] | null>(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [topic, setTopic] = useState('all');

  const load = useCallback(() => {
    return api<{ rooms: RoomItem[] }>('/api/rooms')
      .then(r => { setRooms(r.rooms); setError(''); })
      .catch(e => setError(e.message));
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 15000); // keep the lobby feeling alive
    return () => clearInterval(id);
  }, [load]);

  const topics = useMemo(
    () => Array.from(new Set((rooms ?? []).map(r => r.topic).filter(Boolean))).slice(0, 12),
    [rooms],
  );

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (rooms ?? [])
      .filter(r => topic === 'all' || r.topic === topic)
      .filter(r => !needle || [r.title, r.host_name, r.topic].some(s => s?.toLowerCase().includes(needle)))
      .sort((a, b) => b.audience - a.audience);
  }, [rooms, q, topic]);

  const listening = (rooms ?? []).reduce((n, r) => n + r.audience, 0);
  const filtering = q.trim() !== '' || topic !== 'all';

  return (
    <main>
      {/* ── Hero ─────────────────────────────────────────── */}
      <section className="hero container">
        <div className="hero-copy">
          <span className="hero-pill rise" style={{ '--d': 0 } as React.CSSProperties}>
            <span className="dot" />
            {rooms ? <>{plural(rooms.length, 'room')} live · {listening} listening</> : 'Tuning in…'}
          </span>
          <h1 className="display hero-title rise" style={{ '--d': 1 } as React.CSSProperties}>
            Conversations,<br />live in the <em>air</em>.
          </h1>
          <p className="lede rise" style={{ '--d': 2 } as React.CSSProperties}>
            Drop into audio rooms hosted by real people. Listen free with no account, then raise your hand to step up to the stage.
          </p>
          <div className="hero-actions rise" style={{ '--d': 3 } as React.CSSProperties}>
            <Link href="/create" className="btn btn-primary btn-lg"><Radio size={20} />Start a room</Link>
            <a href="#live" className="btn btn-outline btn-lg">Browse live<ArrowRight size={18} /></a>
          </div>
        </div>

        <div className="hero-art rise" style={{ '--d': 2 } as React.CSSProperties} aria-hidden="true">
          <span className="ring r1" /><span className="ring r2" /><span className="ring r3" />
          <div className="orb">
            <div className="wave">
              {Array.from({ length: 19 }, (_, i) => <i key={i} style={{ '--i': i } as React.CSSProperties} />)}
            </div>
          </div>
          <span className="sat s1" /><span className="sat s2" /><span className="sat s3" /><span className="sat s4" />
        </div>
      </section>

      {/* ── Live rooms ───────────────────────────────────── */}
      <section id="live" className="container live-section">
        <div className="section-head">
          <div>
            <p className="eyebrow">On air</p>
            <h2 className="display section-title">Live <em>now</em></h2>
          </div>
          <label className="search input-wrap">
            <span className="sr-only">Search rooms</span>
            <Search className="lead" aria-hidden="true" />
            <input
              className="input"
              type="search"
              placeholder="Search rooms, hosts, topics"
              value={q}
              onChange={e => setQ(e.target.value)}
            />
          </label>
        </div>

        {topics.length > 1 && (
          <div className="filters" role="group" aria-label="Filter by topic">
            <button type="button" className="chip" aria-pressed={topic === 'all'} onClick={() => setTopic('all')}>All</button>
            {topics.map(t => (
              <button key={t} type="button" className="chip" aria-pressed={topic === t} onClick={() => setTopic(topic === t ? 'all' : t)}>{t}</button>
            ))}
          </div>
        )}

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
          <div className="room-grid" aria-busy="true" aria-label="Loading rooms">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="room-card skeleton-card">
                <div className="skeleton" style={{ height: 24, width: '36%' }} />
                <div className="skeleton" style={{ height: 30, width: '86%', marginTop: 18 }} />
                <div className="skeleton" style={{ height: 30, width: '58%' }} />
                <div className="skeleton" style={{ height: 36, width: '46%', marginTop: 20 }} />
              </div>
            ))}
          </div>
        )}

        {rooms && shown.length > 0 && (
          <ul className="room-grid">
            {shown.map((r, i) => <li key={r.slug}><RoomCard room={r} index={Math.min(i, 8)} /></li>)}
          </ul>
        )}

        {rooms && shown.length === 0 && (
          <div className="empty rise">
            <span className="empty-ico"><AudioLines size={30} /></span>
            {filtering ? (
              <>
                <h3 className="display">Nothing matches that</h3>
                <p className="muted">Try a different search or clear the filters.</p>
                <button type="button" className="btn btn-outline" onClick={() => { setQ(''); setTopic('all'); }}><X size={16} />Clear filters</button>
              </>
            ) : (
              <>
                <h3 className="display">It’s quiet right now</h3>
                <p className="muted">No one is live at the moment. Be the first to open the airwaves.</p>
                <Link href="/create" className="btn btn-primary"><Plus size={18} strokeWidth={2.6} />Start a room</Link>
              </>
            )}
          </div>
        )}
      </section>

      <footer className="container site-foot">
        <span>© {new Date().getFullYear()} AirRoom</span>
        <span className="faint">Live audio, no download required.</span>
      </footer>
    </main>
  );
}
