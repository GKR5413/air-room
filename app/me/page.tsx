'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CircleAlert, CircleCheck, LogOut, Lock, Radio, UserRound } from 'lucide-react';
import { api, supabase } from '@/lib/supabase-browser';
import Avatar from '@/components/Avatar';

export default function Me() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [saved, setSaved] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/api/me')
      .then((p: any) => {
        const n = p.display_name ?? p.profile?.display_name ?? '';
        setName(n); setSaved(n);
      })
      .catch(e => {
        if (/sign in/i.test(e.message)) setNeedsLogin(true);
        else setMsg({ tone: 'error', text: e.message });
      })
      .finally(() => setLoaded(true));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null); setBusy(true);
    try {
      await api('/api/me', { display_name: name });
      setSaved(name);
      setMsg({ tone: 'ok', text: 'Saved. Your new name shows up next time you join a room.' });
    } catch (e: any) {
      setMsg({ tone: 'error', text: e.message });
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.push('/');
  }

  if (loaded && needsLogin) {
    return (
      <main className="container slim page">
        <div className="card card-pad gate rise">
          <span className="empty-ico"><Lock size={28} /></span>
          <h1 className="display">Sign in to see your profile</h1>
          <p className="muted">Your profile lives with your account.</p>
          <Link href="/login" className="btn btn-primary btn-lg">Sign in or sign up</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="container slim page">
      <header className="page-head rise">
        <p className="eyebrow">Your account</p>
        <h1 className="display page-title">Profile</h1>
      </header>

      <section className="card card-pad stack-lg rise" style={{ '--d': 1 } as React.CSSProperties}>
        {!loaded ? (
          <div className="profile-skel">
            <div className="skeleton" style={{ width: 88, height: 88, borderRadius: '50%' }} />
            <div className="skeleton" style={{ height: 48 }} />
          </div>
        ) : (
          <>
            <div className="profile-hero">
              <Avatar name={name || '?'} size={88} />
              <div>
                <div className="profile-name">{saved || 'Unnamed'}</div>
                <div className="faint">This is how others see you in rooms.</div>
              </div>
            </div>

            <form onSubmit={save} className="stack">
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
                <button type="submit" className="btn btn-primary" disabled={busy || !name.trim() || name === saved}>
                  {busy ? <span className="spinner" /> : 'Save changes'}
                </button>
                <Link href="/create" className="btn btn-outline"><Radio size={17} />Start a room</Link>
              </div>
            </form>
          </>
        )}
      </section>

      {loaded && !needsLogin && (
        <div className="profile-foot rise" style={{ '--d': 2 } as React.CSSProperties}>
          <Link href="/" className="btn btn-ghost">Back to rooms</Link>
          <button type="button" className="btn btn-danger" onClick={signOut}><LogOut size={16} />Sign out</button>
        </div>
      )}
    </main>
  );
}
