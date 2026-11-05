'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CircleAlert, CircleCheck, Eye, EyeOff, Lock, LogOut, Mail } from 'lucide-react';
import { supabase } from '@/lib/supabase-browser';
import Avatar from '@/components/Avatar';
import { authErrorMessage } from '@/lib/auth-errors';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [msg, setMsg] = useState('');
  const [signedIn, setSignedIn] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  function showError(error: { code?: string; status?: number; message?: string }) {
    const result = authErrorMessage(error);
    setMsg(result.message);
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setSignedIn(data.user?.email ?? null));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    const signup = mode === 'up';
    setMsg('');
    if (signup && password !== confirm) { submitting.current = false; return setMsg('Passwords do not match.'); }
    setBusy(true);
    try {
      const res = signup
        ? await supabase.auth.signUp({ email: email.trim(), password })
        : await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (res.error) return showError(res.error);
      if (signup && !res.data.session) {
        return setMsg('Check your email to confirm your account, then sign in. Check your spam folder too.');
      }
      router.push('/');
    } catch (err: any) {
      showError(err ?? {});
    } finally {
      submitting.current = false;
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
      <section>
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

          <h1 className="sr-only">{isUp ? 'Create account' : 'Sign in'}</h1>

          <div className="segmented" style={{ '--n': 2, '--i': isUp ? 1 : 0 } as React.CSSProperties} role="group" aria-label="Account mode">
            <span className="segmented-thumb" />
            <button type="button" disabled={busy} aria-pressed={!isUp} onClick={() => { setMode('in'); setMsg(''); }}>Sign in</button>
            <button type="button" disabled={busy} aria-pressed={isUp} onClick={() => { setMode('up'); setMsg(''); }}>Sign up</button>
          </div>

          <form onSubmit={submit} className="stack">
            <div className="field">
              <label className="label" htmlFor="em">Email</label>
              <div className="input-wrap">
                <Mail className="lead" />
                <input id="em" className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required />
              </div>
            </div>
            <div className="field">
              <label className="label" htmlFor="pw">Password{isUp && <span className="opt">6+ characters</span>}</label>
              <div className="input-wrap">
                <Lock className="lead" />
                <input id="pw" className="input" type={show ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" autoComplete={isUp ? 'new-password' : 'current-password'} required minLength={6} />
                <button type="button" className="btn btn-ghost btn-icon btn-sm trail" onClick={() => setShow(s => !s)} aria-label={show ? 'Hide password' : 'Show password'}>
                  {show ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>
            {isUp && (
              <div className="field">
                <label className="label" htmlFor="pw2">Retype password</label>
                <div className="input-wrap">
                  <Lock className="lead" />
                  <input id="pw2" className="input" type={show ? 'text' : 'password'} value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="••••••••" autoComplete="new-password" required minLength={6} aria-describedby="pw2-hint" />
                </div>
                <small id="pw2-hint" className={`hint match ${confirm ? (confirm === password ? 'ok' : 'bad') : ''}`} aria-live="polite">
                  {confirm ? (confirm === password ? 'Passwords match' : 'Passwords don’t match yet') : ' '}
                </small>
              </div>
            )}

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
            {isUp ? 'Already have an account?' : 'New here?'}{' '}
            <button type="button" className="link-btn" disabled={busy} onClick={() => { setMode(isUp ? 'in' : 'up'); setMsg(''); }}>
              {isUp ? 'Sign in' : 'Create one'}
            </button>
          </p>
        </div>
      </section>
    </main>
  );
}
