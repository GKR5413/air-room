'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CircleAlert, EyeOff, Globe, Hand, Lock, Radio } from 'lucide-react';
import { api, supabase } from '@/lib/supabase-browser';
import { LANGUAGES, TOPIC_SUGGESTIONS } from '@/lib/format';
import RoomCard from '@/components/RoomCard';

export default function Create() {
  const router = useRouter();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [name, setName] = useState('You');
  const [f, setF] = useState({ title: '', description: '', topic: '', language: 'en', visibility: 'public', hands_enabled: true });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAuthed(!!data.session);
      const u = data.session?.user;
      if (u) setName(u.user_metadata?.display_name || u.email?.split('@')[0] || 'You');
    });
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
      <main className="container page">
        <div className="skeleton" style={{ height: 56, width: 'min(420px, 80%)' }} />
        <div className="skeleton" style={{ height: 420, marginTop: 32 }} />
      </main>
    );
  }

  if (!authed) {
    return (
      <main className="container slim page">
        <div className="card card-pad gate rise">
          <span className="empty-ico"><Lock size={28} /></span>
          <h1 className="display">Sign in to host</h1>
          <p className="muted">You need an account to open a room. Listening never requires one.</p>
          <Link href="/login" className="btn btn-primary btn-lg">Sign in or sign up</Link>
        </div>
      </main>
    );
  }

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF(prev => ({ ...prev, [k]: v }));

  return (
    <main className="container page">
      <header className="page-head rise">
        <p className="eyebrow">New room</p>
        <h1 className="display page-title">Open the <em>airwaves</em></h1>
        <p className="lede">Give your conversation a name. You go live the moment you create it.</p>
      </header>

      <div className="create-grid">
        <form onSubmit={submit} className="card card-pad stack-lg rise" style={{ '--d': 1 } as React.CSSProperties}>
          <div className="field">
            <label className="label" htmlFor="title">Title <span className="opt">{f.title.length}/90</span></label>
            <input id="title" className="input input-lg" value={f.title} maxLength={90} onChange={e => set('title', e.target.value)} placeholder="What’s the conversation about?" required />
          </div>

          <div className="field">
            <label className="label" htmlFor="desc">Description <span className="opt">Optional</span></label>
            <textarea id="desc" className="textarea" value={f.description} maxLength={400} onChange={e => set('description', e.target.value)} placeholder="Set the scene so people know what to expect." />
          </div>

          <div className="two-col">
            <div className="field">
              <label className="label" htmlFor="topic">Topic <span className="opt">Optional</span></label>
              <input id="topic" className="input" value={f.topic} maxLength={30} onChange={e => set('topic', e.target.value)} placeholder="e.g. Startups" />
            </div>
            <div className="field">
              <label className="label" htmlFor="lang">Language</label>
              <select id="lang" className="select" value={f.language} onChange={e => set('language', e.target.value)}>
                {LANGUAGES.some(l => l.code === f.language) ? null : <option value={f.language}>{f.language}</option>}
                {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
              </select>
            </div>
          </div>
          <div className="suggest" role="group" aria-label="Topic suggestions">
            {TOPIC_SUGGESTIONS.map(t => (
              <button key={t} type="button" className="chip" aria-pressed={f.topic === t} onClick={() => set('topic', f.topic === t ? '' : t)}>{t}</button>
            ))}
          </div>

          <div className="field">
            <span className="label" id="vis-l">Who can find it</span>
            <div className="option-grid" role="radiogroup" aria-labelledby="vis-l">
              <button type="button" role="radio" aria-checked={f.visibility === 'public'} className="option" onClick={() => set('visibility', 'public')}>
                <span className="ico"><Globe size={18} /></span>
                <strong>Public</strong>
                <span className="sub">Listed on Explore for everyone</span>
              </button>
              <button type="button" role="radio" aria-checked={f.visibility === 'unlisted'} className="option" onClick={() => set('visibility', 'unlisted')}>
                <span className="ico"><EyeOff size={18} /></span>
                <strong>Unlisted</strong>
                <span className="sub">Only people with the link</span>
              </button>
            </div>
          </div>

          <div className="switch-row">
            <div>
              <strong><Hand size={15} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 6 }} />Allow raised hands</strong>
              <span className="sub">Listeners can ask to speak. You pick who joins the stage.</span>
            </div>
            <button
              type="button" role="switch" className="switch" aria-checked={f.hands_enabled}
              aria-label="Allow raised hands" onClick={() => set('hands_enabled', !f.hands_enabled)}
            />
          </div>

          {err && <div className="alert alert-error" role="alert"><CircleAlert /><span>{err}</span></div>}

          <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy || !f.title.trim()}>
            {busy ? <span className="spinner" /> : <><Radio size={20} />Create room</>}
          </button>
        </form>

        <aside className="preview rise" style={{ '--d': 2 } as React.CSSProperties}>
          <p className="eyebrow">Live preview</p>
          <RoomCard
            preview
            room={{ slug: 'preview', title: f.title.trim() || 'Your room title', topic: f.topic.trim(), language: f.language, host_name: name, audience: 0 }}
          />
          <p className="hint">This is how your room appears on Explore. {f.visibility === 'unlisted' && 'Unlisted rooms are hidden from Explore, so share the link directly.'}</p>
        </aside>
      </div>
    </main>
  );
}
