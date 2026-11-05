'use client';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, MessageCircle } from 'lucide-react';
import { api } from '@/lib/supabase-browser';
import Avatar from './Avatar';
import ConnectionList from './ConnectionList';
import PhotoViewer from './PhotoViewer';

export type Profile = {
  id: string; display_name: string; username: string | null; avatar_url: string | null;
  followers: number; following: number; isMe: boolean; signedIn: boolean; isFollowing: boolean; followsYou: boolean;
};

type Fallback = { name: string; avatar_url?: string | null; username?: string | null };

/** Anyone's public profile: tap the photo to see it full screen, tap the counts to see who follows whom. */
export default function ProfileCard({ who, fallback, footer }: { who: string; fallback?: Fallback; footer?: ReactNode }) {
  const [p, setP] = useState<Profile | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<'profile' | 'followers' | 'following'>('profile');
  const [viewing, setViewing] = useState(false);
  const router = useRouter();

  const load = useCallback(() => {
    return api<Profile>(`/api/profiles/${encodeURIComponent(who)}`)
      .then(r => { setP(r); setErr(''); })
      .catch(e => setErr(e.message));
  }, [who]);

  useEffect(() => { setP(null); setErr(''); setView('profile'); setViewing(false); void load(); }, [load]);

  async function toggle() {
    if (!p || busy) return;
    const follow = !p.isFollowing;
    setBusy(true);
    try {
      await api(`/api/people/${p.id}`, { action: follow ? 'follow' : 'unfollow' });
      setP({ ...p, isFollowing: follow, followers: Math.max(0, p.followers + (follow ? 1 : -1)) });
      window.dispatchEvent(new Event('people-updated'));
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  /** Friends (you follow each other) can message. */
  async function message() {
    if (!p || busy) return;
    setBusy(true);
    try {
      const { id } = await api<{ id: string }>('/api/chat/conversations', { userId: p.id });
      router.push(`/messages/${id}`);
    } catch (e: any) { setErr(e.message); setBusy(false); }
  }

  const name = p?.display_name ?? fallback?.name ?? 'Unknown';
  const photo = p ? p.avatar_url : fallback?.avatar_url ?? null;
  /** The photo, tappable for a full-screen view when there is one. */
  const picture = (
    photo ? (
      <button type="button" className="avatar-btn" onClick={() => setViewing(true)} aria-label={`View ${name}’s photo`}>
        <Avatar name={name} src={photo} size={96} />
      </button>
    ) : <Avatar name={name} size={96} />
  );
  const viewer = viewing && photo ? <PhotoViewer src={photo} name={name} onClose={() => setViewing(false)} /> : null;

  if (err && !p) {
    // Guests have no profile page; show what the room already knows about them.
    return (
      <div className="pcard">
        {fallback && picture}
        <h2 className="pcard-name">{name}</h2>
        <p className="muted">{/not found/i.test(err) ? 'No profile for this person.' : err}</p>
        {viewer}
      </div>
    );
  }

  if (!p) {
    return (
      <div className="pcard" aria-busy="true">
        {fallback ? picture : <div className="skeleton" style={{ width: 96, height: 96, borderRadius: '36%' }} />}
        <h2 className="pcard-name">{fallback?.name ?? <span className="skeleton" style={{ display: 'block', height: 26, width: 160 }} />}</h2>
        <div className="skeleton" style={{ height: 16, width: 120 }} />
        {viewer}
      </div>
    );
  }

  if (view !== 'profile') {
    return (
      <div className="pcard-list">
        <button type="button" className="back-btn" onClick={() => setView('profile')}><ChevronLeft size={20} />{p.display_name}</button>
        <h3 className="sub-head">{view === 'followers' ? 'Followers' : 'Following'}</h3>
        <ConnectionList who={p.id} type={view} />
      </div>
    );
  }

  return (
    <>
      <div className="pcard">
        {picture}
        <h2 className="pcard-name">{p.display_name}</h2>
        {p.username && <p className="pcard-user">@{p.username}</p>}
        <p className="pcard-stats">
          <button type="button" className="stat-link" onClick={() => setView('followers')}><b>{p.followers}</b> {p.followers === 1 ? 'follower' : 'followers'}</button>
          <i aria-hidden="true">•</i>
          <button type="button" className="stat-link" onClick={() => setView('following')}><b>{p.following}</b> following</button>
        </p>
        {p.followsYou && <span className="chip">follows you</span>}
        {p.isMe ? (
          <Link href="/me" className="btn btn-outline">Edit profile</Link>
        ) : p.signedIn ? (
          <div className="pcard-actions">
            {p.isFollowing && p.followsYou && (
              <button type="button" className="btn btn-primary" disabled={busy} onClick={message}><MessageCircle size={18} />Message</button>
            )}
            <button type="button" className={`btn ${p.isFollowing ? 'btn-outline' : 'btn-primary'}`} disabled={busy} onClick={toggle} aria-pressed={p.isFollowing}>
              {p.isFollowing ? 'Following' : p.followsYou ? 'Follow back' : 'Follow'}
            </button>
          </div>
        ) : (
          <Link href="/login" className="btn btn-outline">Sign in to follow</Link>
        )}
        {err && <p className="hint" role="alert">{err}</p>}
        {viewer}
      </div>
      {footer}
    </>
  );
}
