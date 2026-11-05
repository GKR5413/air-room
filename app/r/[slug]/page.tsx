'use client';
import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, CircleAlert, Globe, Headphones, Link2, Radio, Tag } from 'lucide-react';
import { useLiveRefresh } from '@/lib/use-live-refresh';
import { api } from '@/lib/supabase-browser';
import { languageName } from '@/lib/format';
import type { RoomRow } from '@/lib/types';
import Avatar from '@/components/Avatar';
import { useToast } from '@/components/Providers';
import { useRoomSession } from '@/components/RoomSession';

export default function RoomPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const toast = useToast();
  const session = useRoomSession();
  const [info, setInfo] = useState<{ room: RoomRow; host_name: string; host_avatar_url?: string | null; status: string } | null>(null);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api(`/api/rooms/${slug}`).then(setInfo).catch(e => setErr(e.message));
  }, [slug]);

  useLiveRefresh([`room:${slug}`, 'profiles'], () => api(`/api/rooms/${slug}`).then(setInfo).catch(e => setErr(e.message)));

  // Once joined, the live room is rendered by <RoomSessionProvider/> so it survives navigation.
  if (session.slug === slug) return null;

  if (err) {
    return (
      <main className="container mid page">
        <div className="card card-pad gate rise">
          <span className="empty-ico"><CircleAlert size={24} /></span>
          <h1 className="display">Room not found</h1>
          <p className="muted" role="alert">{err}</p>
          <Link href="/" className="btn btn-outline"><ArrowLeft size={17} />Back to rooms</Link>
        </div>
      </main>
    );
  }

  if (!info) {
    return (
      <main className="container mid page" aria-busy="true">
        <div className="skeleton" style={{ height: 28, width: 70 }} />
        <div className="skeleton" style={{ height: 44, width: '75%', marginTop: 20 }} />
        <div className="skeleton" style={{ height: 24, width: '40%', marginTop: 16 }} />
      </main>
    );
  }

  const { room, host_name, status } = info;
  const live = status !== 'ended';

  async function copy() {
    try {
      await navigator.clipboard.writeText(location.href);
      setCopied(true); setTimeout(() => setCopied(false), 1800);
    } catch { toast('Couldn’t copy. Copy the address bar link instead.', 'error'); }
  }

  return (
    <main className="container mid page">
      <Link href="/" className="back-link"><ArrowLeft size={16} />Rooms</Link>

      <article className="card lobby-body rise">
        <div><span className={`live-badge${live ? '' : ' ended'}`}>{live ? 'Live' : 'Ended'}</span></div>

        <h1 className="display lobby-title">{room.title}</h1>

        <div className="lobby-host">
          <Avatar name={host_name} src={info.host_avatar_url} size={32} />
          <span>Hosted by <strong>{host_name}</strong></span>
        </div>

        {room.description && <p className="lobby-desc">{room.description}</p>}

        {(room.topic || room.language) && (
          <div className="lobby-chips">
            {room.topic && <span className="chip"><Tag aria-hidden="true" />{room.topic}</span>}
            {room.language && <span className="chip"><Globe aria-hidden="true" />{languageName(room.language)}</span>}
          </div>
        )}

        {live ? (
          <div className="lobby-cta">
            <button type="button" className="btn btn-primary btn-lg" onClick={() => { void session.join(slug); }}>
              <Headphones size={20} />Join and listen
            </button>
            <button type="button" className="btn btn-outline btn-lg" onClick={copy}>
              {copied ? <><Check size={18} />Copied</> : <><Link2 size={18} />Copy link</>}
            </button>
          </div>
        ) : (
          <div className="alert alert-info" role="status">
            <Radio />
            <div>
              <strong>This room has ended.</strong>
              <div className="muted">Find another one on Explore.</div>
            </div>
          </div>
        )}
      </article>
    </main>
  );
}
