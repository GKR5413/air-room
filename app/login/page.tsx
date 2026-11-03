'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CircleAlert, CircleCheck, Eye, EyeOff, Lock, LogOut, Mail, UserRound } from 'lucide-react';
import { supabase } from '@/lib/supabase-browser';
import Avatar from '@/components/Avatar';
import { LogoMark } from '@/components/Logo';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [msg, setMsg] = useState('');
  const [signedIn, setSignedIn] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setSignedIn(data.user?.email ?? null));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg('');
    setBusy(true);
    try {
      const res = mode === 'up'
        ? await supabase.auth.signUp({ email, password, options: { data: { display_name: displayName } } })
        : await supabase.auth.signInWithPassword({ email, password });
      if (res.error) return setMsg(res.error.message);
      if (mode === 'up' && !res.data.session) return setMsg('Check your email to confirm your account, then sign in.');
      router.push('/');
    } catch (err: any) {
      setMsg(err?.message || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    setSignedIn(null);
    router.push('/');
  }

  const isUp = mode === 'up';
  const infoMsg = msg.startsWith('Check your email');

  return (
    <main className="auth">
      <aside className="auth-art" aria-hidden="true">
        <div className="auth-art-inner">
          <LogoMark size={44} />
          <h2 className="display">Your voice,<br />in the <em>air</em>.</h2>
          <p className="muted">Join thousands of live conversations, or open one of your own in a single tap.</p>
        </div>
        <div className="wave big">
          {Array.from({ length: 34 }, (_, i) => <i key={i} style={{ '--i': i } as React.CSSProperties} />)}
        </div>
      </aside>

      <section className="auth-panel">
        <div className="auth-card rise">
          {signedIn && (
            <div className="account-strip">
              <Avatar name={signedIn} size={40} />
              <div className="account-strip-text">
                <span className="faint">Signed in as</span>
                <strong>{signedIn}</strong>
              </div>
              <button type="button" className="btn btn-outline btn-sm" onClick={signOut}><LogOut size={15} />Sign out</button>
            </div>
          )}

          <div>
            <h1 className="display auth-title">{isUp ? 'Create your account' : 'Welcome back'}</h1>
            <p className="muted" style={{ marginTop: 8 }}>
              {isUp ? 'Pick a display name and you’re ready to host and speak.' : 'Sign in to host rooms, raise your hand and join the stage.'}
            </p>
          </div>

          <div className="segmented" style={{ '--n': 2, '--i': isUp ? 1 : 0 } as React.CSSProperties} role="group" aria-label="Account mode">
            <span className="segmented-thumb" />
            <button type="button" aria-pressed={!isUp} onClick={() => { setMode('in'); setMsg(''); }}>Sign in</button>
            <button type="button" aria-pressed={isUp} onClick={() => { setMode('up'); setMsg(''); }}>Sign up</button>
          </div>

          <form onSubmit={submit} className="stack">
            {isUp && (
              <div className="field">
                <label className="label" htmlFor="dn">Display name</label>
                <div className="input-wrap">
                  <UserRound className="lead" />
                  <input id="dn" className="input" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="How should we call you?" autoComplete="nickname" required />
                </div>
              </div>
            )}
            <div className="field">
              <label className="label" htmlFor="em">Email</label>
              <div className="input-wrap">
                <Mail className="lead" />
                <input id="em" className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required />
              </div>
            </div>
            <div className="field">
              <label className="label" htmlFor="pw">Password <span className="opt">{isUp ? 'At least 6 characters' : ''}</span></label>
              <div className="input-wrap">
                <Lock className="lead" />
                <input id="pw" className="input" type={show ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" autoComplete={isUp ? 'new-password' : 'current-password'} required minLength={6} />
                <button type="button" className="btn btn-ghost btn-icon btn-sm trail" onClick={() => setShow(s => !s)} aria-label={show ? 'Hide password' : 'Show password'}>
                  {show ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>

            {msg && (
              <div className={`alert ${infoMsg ? 'alert-ok' : 'alert-error'}`} role="alert">
                {infoMsg ? <CircleCheck /> : <CircleAlert />}<span>{msg}</span>
              </div>
            )}

            <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy}>
              {busy ? <span className="spinner" /> : isUp ? 'Create account' : 'Sign in'}
            </button>
          </form>

          <p className="auth-switch muted">
            {isUp ? 'Have an account?' : 'Need an account?'}{' '}
            <button type="button" className="link-btn" onClick={() => { setMode(isUp ? 'in' : 'up'); setMsg(''); }}>
              {isUp ? 'Sign in' : 'Sign up'}
            </button>
          </p>
        </div>
      </section>
    </main>
  );
}
