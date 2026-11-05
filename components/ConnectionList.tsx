'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Users } from 'lucide-react';
import { api } from '@/lib/supabase-browser';
import Avatar from './Avatar';

type Row = { id: string; display_name: string; username: string | null; avatar_url: string | null; isMe: boolean; isFollowing: boolean };

/** Who follows someone, or who they follow. Everyone listed is a tap away from their own profile. */
export default function ConnectionList({ who, type }: { who: string; type: 'followers' | 'following' }) {
  const [people, setPeople] = useState<Row[] | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setPeople(null); setErr('');
    api<{ people: Row[]; signedIn?: boolean }>(`/api/profiles/${encodeURIComponent(who)}/connections?type=${type}`)
      .then(r => { if (live) { setPeople(r.people); setSignedIn(!!r.signedIn); } })
      .catch(e => { if (live) setErr(e.message); });
    return () => { live = false; };
  }, [who, type]);

  async function toggle(p: Row) {
    if (busy) return;
    setBusy(p.id);
    try {
      await api(`/api/people/${p.id}`, { action: p.isFollowing ? 'unfollow' : 'follow' });
      setPeople(list => (list ?? []).map(x => x.id === p.id ? { ...x, isFollowing: !p.isFollowing } : x));
      window.dispatchEvent(new Event('people-updated'));
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(null); }
  }

  if (err && !people) return <p className="muted" role="alert">{err}</p>;
  if (!people) {
    return (
      <ul className="people-list" aria-busy="true" aria-label="Loading">
        {[0, 1, 2].map(i => (
          <li key={i} className="person-row">
            <div className="skeleton" style={{ width: 48, height: 48, borderRadius: '36%' }} />
            <div className="person-info"><div className="skeleton" style={{ height: 14, width: '40%' }} /><div className="skeleton" style={{ height: 12, width: '25%' }} /></div>
          </li>
        ))}
      </ul>
    );
  }
  if (!people.length) {
    return <div className="rec-empty"><Users size={22} /><span>{type === 'followers' ? 'No followers yet.' : 'Not following anyone yet.'}</span></div>;
  }
  return (
    <>
      <ul className="people-list">
        {people.map(p => (
          <li key={p.id} className="person-row">
            <Link href={`/u/${p.id}`} className="person-link" aria-label={`View ${p.display_name}’s profile`}>
              <Avatar name={p.display_name} src={p.avatar_url} size={48} />
              <div className="person-info">
                <strong>{p.display_name}</strong>
                <span className="muted">{p.username ? `@${p.username}` : 'No username yet'}</span>
              </div>
            </Link>
            {signedIn && !p.isMe && (
              <button type="button" className={`btn btn-sm ${p.isFollowing ? 'btn-outline' : 'btn-primary'}`} disabled={busy === p.id} onClick={() => toggle(p)} aria-pressed={p.isFollowing}>
                {p.isFollowing ? 'Following' : 'Follow'}
              </button>
            )}
          </li>
        ))}
      </ul>
      {err && <p className="hint" role="alert">{err}</p>}
    </>
  );
}
