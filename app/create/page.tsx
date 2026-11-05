'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown, CircleAlert, Lock } from 'lucide-react';
import { api, supabase } from '@/lib/supabase-browser';
import { LANGUAGES } from '@/lib/format';

export default function Create() {
  const router = useRouter();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [f, setF] = useState({ title: '', description: '', topic: '', language: 'en', visibility: 'public', hands_enabled: true });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAuthed(!!data.session));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const { slug } = await api<{ slug: string }>('/api/rooms', f);
      router.push(`/r/${slug}`);
    } catch (e: any) { setErr(e.message); setBusy(false); }
  }

  if (authed === null) {
    return (
      <main className="container mid page">
        <div className="skeleton" style={{ height: 40, width: 200 }} />
        <div className="skeleton" style={{ height: 180, marginTop: 24 }} />
      </main>
    );
  }

  if (!authed) {
    return (
      <main className="container mid page">
        <div className="card card-pad gate rise">
          <span className="empty-ico"><Lock size={24} /></span>
          <h1 className="display">Sign in to host</h1>
          <p className="muted">You need an account to start a room. Listening never needs one.</p>
          <Link href="/login" className="btn btn-primary btn-lg">Sign in</Link>
        </div>
      </main>
    );
  }

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF(prev => ({ ...prev, [k]: v }));

  return (
    <main className="container mid page">
      <header className="page-head rise">
        <h1 className="display page-title">Start a room</h1>
      </header>

      <form onSubmit={submit} className="card card-pad stack-lg rise" style={{ '--d': 1 } as React.CSSProperties}>
        <div className="field">
          <label className="sr-only" htmlFor="title">Title</label>
          <input id="title" className="input input-lg" value={f.title} maxLength={90} onChange={e => set('title', e.target.value)} placeholder="What’s it about?" required />
        </div>

        <details className="more">
          <summary>More options<ChevronDown size={18} /></summary>
          <div className="more-body">
            <div className="two-col">
              <div className="field">
                <label className="label" htmlFor="topic">Topic</label>
                <input id="topic" className="input" value={f.topic} maxLength={30} onChange={e => set('topic', e.target.value)} placeholder="Optional" />
              </div>
              <div className="field">
                <label className="label" htmlFor="lang">Language</label>
                <select id="lang" className="select" value={f.language} onChange={e => set('language', e.target.value)}>
                  {LANGUAGES.some(l => l.code === f.language) ? null : <option value={f.language}>{f.language}</option>}
                  {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
                </select>
              </div>
            </div>

            <div className="switch-row">
              <div>
                <strong>Unlisted</strong>
                <span className="sub">Hide from Explore. Share the link instead.</span>
              </div>
              <button
                type="button" role="switch" className="switch" aria-checked={f.visibility === 'unlisted'}
                aria-label="Unlisted" onClick={() => set('visibility', f.visibility === 'unlisted' ? 'public' : 'unlisted')}
              />
            </div>

            <div className="switch-row">
              <div>
                <strong>Raised hands</strong>
                <span className="sub">Listeners can ask to speak.</span>
              </div>
              <button
                type="button" role="switch" className="switch" aria-checked={f.hands_enabled}
                aria-label="Allow raised hands" onClick={() => set('hands_enabled', !f.hands_enabled)}
              />
            </div>
          </div>
        </details>

        {err && <div className="alert alert-error" role="alert"><CircleAlert /><span>{err}</span></div>}

        <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy || !f.title.trim()}>
          {busy ? <span className="spinner" /> : 'Go live'}
        </button>
      </form>
    </main>
  );
}
