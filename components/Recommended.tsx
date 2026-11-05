'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CircleAlert, RefreshCw, UserPlus, Users } from 'lucide-react';
import { api } from '@/lib/supabase-browser';
import { reasonLabel, type RecReason } from '@/lib/recommend';
import { useLiveRefresh } from '@/lib/use-live-refresh';
import Avatar from './Avatar';

type Rec = { id: string; display_name: string; username: string | null; avatar_url: string | null; reason: RecReason; mutuals: number };

/** "Recommended for you": people to follow, ranked from existing users (see lib/recommend.ts). */
export default function Recommended() {
  const [recs, setRecs] = useState<Rec[] | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<string | null>(null);

  const load = useCallback(() => {
    setError('');
    return api<{ recommendations: Rec[] }>('/api/people/recommended')
      .then(r => setRecs(r.recommendations))
      .catch(e => { setError(e.message); setRecs(prev => prev ?? []); });
  }, []);

  useEffect(() => {
    void load();
    // Following someone from the search list also changes who should be suggested.
    const again = () => { void load(); };
    window.addEventListener('people-updated', again);
    return () => window.removeEventListener('people-updated', again);
  }, [load]);

  useLiveRefresh(['me', 'profiles'], load);

  async function follow(id: string) {
    setPending(id); setError('');
    try {
      await api(`/api/people/${id}`, { action: 'follow' });
      setRecs(list => (list ?? []).filter(p => p.id !== id)); // disappears right away
      window.dispatchEvent(new Event('people-updated'));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="card card-pad stack-lg recs" aria-label="Recommended people">
      <div className="rec-head">
        <h2>Suggested people</h2>
      </div>

      {error && (
        <div className="alert alert-error" role="alert">
          <CircleAlert /><span style={{ flex: 1 }}>{error}</span>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => void load()}><RefreshCw size={14} />Retry</button>
        </div>
      )}

      {recs === null ? (
        <ul className="people-list" aria-busy="true" aria-label="Loading recommendations">
          {[0, 1, 2].map(i => (
            <li key={i} className="person-row">
              <div className="skeleton" style={{ width: 44, height: 44, borderRadius: '50%' }} />
              <div className="person-info"><div className="skeleton" style={{ height: 14, width: '40%' }} /><div className="skeleton" style={{ height: 12, width: '25%' }} /></div>
            </li>
          ))}
        </ul>
      ) : recs.length === 0 ? (
        !error && (
          <div className="rec-empty">
            <Users size={22} />
            <span>No suggestions right now.</span>
          </div>
        )
      ) : (
        <ul className="people-list">
          {recs.map(p => (
            <li key={p.id} className="person-row rec-row">
              <Link href={`/u/${p.id}`} className="person-link" aria-label={`View ${p.display_name}’s profile`}>
                <Avatar name={p.display_name} src={p.avatar_url} size={48} />
                <div className="person-info">
                  <strong>{p.display_name}</strong>
                  <span className="muted">{p.username ? `@${p.username}` : 'No username yet'}</span>
                  <span className={`chip rec-chip${p.reason === 'follows_you' ? ' chip-accent' : ''}`}>{reasonLabel(p.reason, p.mutuals)}</span>
                </div>
              </Link>
              <button type="button" className="btn btn-primary btn-sm rec-follow" disabled={pending === p.id} onClick={() => void follow(p.id)} aria-label={`Follow ${p.display_name}`}>
                {pending === p.id ? <span className="spinner" /> : <><UserPlus size={14} />{p.reason === 'follows_you' ? 'Follow back' : 'Follow'}</>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
