'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Camera, ChevronDown, CircleAlert, CircleCheck, LogOut, Lock, UserRound } from 'lucide-react';
import { api, supabase } from '@/lib/supabase-browser';
import Avatar from '@/components/Avatar';
import Connections from '@/components/Connections';
import Recommended from '@/components/Recommended';
import { useLiveRefresh } from '@/lib/use-live-refresh';
import Modal from '@/components/Modal';
import PhotoAdjuster from '@/components/PhotoAdjuster';
import PhotoViewer from '@/components/PhotoViewer';
import ConnectionList from '@/components/ConnectionList';

export default function Me() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [saved, setSaved] = useState('');
  const [username, setUsername] = useState('');
  const [avatar, setAvatar] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [counts, setCounts] = useState<{ followers: number; following: number } | null>(null);
  const previousProfile = useRef({ name: '', username: '' });
  const fileRef = useRef<HTMLInputElement>(null);
  const [meId, setMeId] = useState('');
  const [adjust, setAdjust] = useState<{ src: string; revoke: boolean } | null>(null);
  const [viewing, setViewing] = useState(false);
  const [listType, setListType] = useState<'followers' | 'following' | null>(null);

  useEffect(() => {
    api('/api/me')
      .then((p: any) => {
        const n = p.display_name ?? p.profile?.display_name ?? '';
        setName(n); setSaved(n);
        previousProfile.current = { name: n, username: p.profile?.username ?? '' };
        setUsername(p.profile?.username ?? '');
        setAvatar(p.profile?.avatar_url ?? null);
        setMeId(p.profile?.id ?? '');
      })
      .catch(e => {
        if (/sign in/i.test(e.message)) setNeedsLogin(true);
        else setMsg({ tone: 'error', text: e.message });
      })
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (!loaded || needsLogin) return;
    const load = () => api<{ followerIds: string[]; followingIds: string[] }>('/api/people?ids=1')
      .then(r => setCounts({ followers: r.followerIds.length, following: r.followingIds.length })).catch(() => {});
    void load();
    window.addEventListener('people-updated', load);
    return () => window.removeEventListener('people-updated', load);
  }, [loaded, needsLogin]);

  useLiveRefresh(['me'], async () => {
    if (!loaded || needsLogin || busy || photoBusy) return;
    try {
      const { profile } = await api('/api/me');
      const old = previousProfile.current;
      const nextName = profile.display_name ?? '';
      const nextUsername = profile.username ?? '';
      setName(current => current === old.name ? nextName : current);
      setUsername(current => current === old.username ? nextUsername : current);
      setSaved(nextName); setAvatar(profile.avatar_url ?? null);
      previousProfile.current = { name: nextName, username: nextUsername };
    } catch { /* Preserve the editable profile during a transient connection failure. */ }
  });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null); setBusy(true);
    try {
      const result = await api('/api/me', { display_name: name, avatar_url: avatar, ...(username.trim() ? { username } : {}) });
      previousProfile.current = { name: result.profile.display_name, username: result.profile.username ?? '' };
      setSaved(result.profile.display_name);
      setName(result.profile.display_name);
      setUsername(result.profile.username ?? '');
      window.dispatchEvent(new Event('profile-updated'));
      setMsg({ tone: 'ok', text: 'Profile saved.' });
    } catch (e: any) {
      setMsg({ tone: 'error', text: e.message });
    } finally {
      setBusy(false);
    }
  }

  /** Save the photo right away (no separate "Save changes" step to forget). */
  async function savePhoto(next: string | null): Promise<boolean> {
    const display = (saved || name).trim();
    if (!display) { setMsg({ tone: 'error', text: 'Add a display name first.' }); return false; }
    setPhotoBusy(true); setMsg(null);
    try {
      const result = await api('/api/me', { display_name: display, avatar_url: next });
      setAvatar(result.profile.avatar_url ?? null);
      window.dispatchEvent(new Event('profile-updated'));
      setMsg({ tone: 'ok', text: next ? 'Profile photo updated.' : 'Profile photo removed.' });
      return true;
    } catch (e: any) {
      setMsg({ tone: 'error', text: e.message });
      return false;
    } finally {
      setPhotoBusy(false);
    }
  }

  async function choosePhoto(file?: File) {
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size > 15 * 1024 * 1024) {
      setMsg({ tone: 'error', text: 'Choose an image file under 15 MB.' });
      return;
    }
    setMsg(null);
    setAdjust({ src: URL.createObjectURL(file), revoke: true });
  }

  function closeAdjust() {
    if (adjust?.revoke) URL.revokeObjectURL(adjust.src);
    setAdjust(null);
  }

  async function saveAdjusted(dataUrl: string) {
    if (await savePhoto(dataUrl)) closeAdjust();
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.push('/');
  }

  if (loaded && needsLogin) {
    return (
      <main className="container slim page">
        <div className="card card-pad gate rise">
          <span className="empty-ico"><Lock size={24} /></span>
          <h1 className="display">Sign in to see your profile</h1>
          <Link href="/login" className="btn btn-primary btn-lg">Sign in</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="container mid page">
      <h1 className="sr-only">Your profile</h1>

      <section className="card card-pad stack-lg rise" style={{ '--d': 1 } as React.CSSProperties}>
        {!loaded ? (
          <div className="profile-skel">
            <div className="skeleton" style={{ width: 96, height: 96, borderRadius: '36%' }} />
            <div className="skeleton" style={{ height: 48 }} />
          </div>
        ) : (
          <>
            <div className="profile-hero">
              {avatar ? (
                <button type="button" className="avatar-btn" onClick={() => setViewing(true)} aria-label="View your photo"><Avatar name={name || '?'} src={avatar} size={96} /></button>
              ) : <Avatar name={name || '?'} size={96} />}
              <div className="profile-id">
                <div className="profile-name">{saved || 'Unnamed'}</div>
                {username && <div className="pcard-user">@{username}</div>}
                {counts && meId && (
                  <div className="pcard-stats">
                    <button type="button" className="stat-link" onClick={() => setListType('followers')}><b>{counts.followers}</b> {counts.followers === 1 ? 'follower' : 'followers'}</button>
                    <i aria-hidden="true">•</i>
                    <button type="button" className="stat-link" onClick={() => setListType('following')}><b>{counts.following}</b> following</button>
                  </div>
                )}
                <div className="row-actions">
                  <button type="button" className="btn btn-outline btn-sm" disabled={photoBusy || busy} onClick={() => fileRef.current?.click()}>
                    {photoBusy ? <span className="spinner" /> : <Camera size={15} />}{avatar ? 'Change photo' : 'Add photo'}
                  </button>
                  {avatar && <button type="button" className="btn btn-ghost btn-sm" disabled={photoBusy || busy} onClick={() => setAdjust({ src: avatar, revoke: false })}>Adjust</button>}
                  {avatar && <button type="button" className="btn btn-ghost btn-sm" disabled={photoBusy || busy} onClick={() => void savePhoto(null)}>Remove</button>}
                </div>
                <input ref={fileRef} type="file" accept="image/*" hidden aria-label="Choose a profile photo" onChange={e => { void choosePhoto(e.target.files?.[0]); e.target.value = ''; }} />
              </div>
            </div>

            <details className="more" open={!username.trim()}>
            <summary>Edit profile<ChevronDown size={18} /></summary>
            <form onSubmit={save} className="stack more-body">
              <div className="field">
                <label className="label" htmlFor="username">Username</label>
                <input id="username" className="input" value={username} onChange={e => setUsername(e.target.value.toLowerCase())} minLength={3} maxLength={24} pattern="[a-z0-9_]{3,24}" autoCapitalize="none" autoComplete="username" spellCheck={false} aria-describedby="username-help" />
                <small id="username-help" className="hint">3–24 letters, numbers or underscores</small>
              </div>
              <div className="field">
                <label className="label" htmlFor="name">Display name</label>
                <div className="input-wrap">
                  <UserRound className="lead" />
                  <input id="name" className="input" value={name} onChange={e => setName(e.target.value)} maxLength={40} required />
                </div>
              </div>
              {msg && (
                <div className={`alert ${msg.tone === 'ok' ? 'alert-ok' : 'alert-error'}`} role="status">
                  {msg.tone === 'ok' ? <CircleCheck /> : <CircleAlert />}<span>{msg.text}</span>
                </div>
              )}
              <div className="row-actions">
                <button type="submit" className="btn btn-primary" disabled={busy || photoBusy || !name.trim()}>
                  {busy ? <span className="spinner" /> : 'Save changes'}
                </button>
              </div>
            </form>
            </details>
          </>
        )}
      </section>

      {loaded && !needsLogin && <Recommended />}

      {loaded && !needsLogin && <Connections />}

      {adjust && <PhotoAdjuster src={adjust.src} busy={photoBusy} onCancel={closeAdjust} onSave={dataUrl => void saveAdjusted(dataUrl)} />}
      {viewing && avatar && <PhotoViewer src={avatar} name={saved || name || 'Your'} onClose={() => setViewing(false)} />}
      <Modal open={!!listType && !!meId} onClose={() => setListType(null)} title={listType === 'followers' ? 'Followers' : 'Following'}>
        {listType && meId && <ConnectionList who={meId} type={listType} />}
      </Modal>

      {loaded && !needsLogin && (
        <div className="profile-foot rise" style={{ '--d': 2 } as React.CSSProperties}>
          <button type="button" className="btn btn-ghost" onClick={signOut}><LogOut size={16} />Sign out</button>
        </div>
      )}
    </main>
  );
}
