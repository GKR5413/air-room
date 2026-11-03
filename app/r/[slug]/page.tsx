'use client';
import { use, useEffect, useState, type CSSProperties } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { ArrowLeft, Check, CircleAlert, Globe, Hand, Headphones, Link2, Mic, Radio, Tag } from 'lucide-react';
import { api } from '@/lib/supabase-browser';
import { glowHue, languageName } from '@/lib/format';
import type { RoomRow } from '@/lib/types';
import Avatar from '@/components/Avatar';
import { useToast } from '@/components/Providers';

// livekit-client is ~150 kB: only fetch it once someone presses "Join".
const LiveRoom = dynamic(() => import('@/components/LiveRoom'), {
  ssr: false,
  loading: () => <div className="room-loading" role="status" aria-label="Joining room"><span className="spinner" /></div>,
});

export default function RoomPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const toast = useToast();
  const [info, setInfo] = useState<{ room: RoomRow; host_name: string; status: string } | null>(null);
  const [err, setErr] = useState('');
  const [joined, setJoined] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api(`/api/rooms/${slug}`).then(setInfo).catch(e => setErr(e.message));
  }, [slug]);

  if (err) {
    return (
      <main className="container slim page">
        <div className="card card-pad gate rise">
          <span className="empty-ico"><CircleAlert size={28} /></span>
          <h1 className="display">Room not found</h1>
          <p className="muted" role="alert">{err}</p>
          <Link href="/" className="btn btn-outline"><ArrowLeft size={17} />Back to rooms</Link>
        </div>
      </main>
    );
  }

  if (!info) {
    return (
      <main className="container narrow page" aria-busy="true">
        <div className="skeleton" style={{ height: 260, borderRadius: 32 }} />
        <div className="skeleton" style={{ height: 60, width: '70%', marginTop: 28 }} />
        <div className="skeleton" style={{ height: 24, width: '40%', marginTop: 16 }} />
      </main>
    );
  }

  const { room, host_name, status } = info;
  const live = status !== 'ended';

  if (joined) return <main><LiveRoom slug={slug} onLeave={() => setJoined(false)} /></main>;

  async function copy() {
    try {
      await navigator.clipboard.writeText(location.href);
      setCopied(true); setTimeout(() => setCopied(false), 1800);
    } catch { toast('Couldn’t copy. Copy the address bar link instead.', 'error'); }
  }

  return (
    <main className="container narrow page">
      <Link href="/" className="back-link"><ArrowLeft size={16} />All rooms</Link>

      <article className="lobby card rise" style={{ '--h': glowHue(room.slug || room.title) } as CSSProperties}>
        <div className="lobby-art" aria-hidden="true">
          <span className="ring r1" /><span className="ring r2" /><span className="ring r3" />
          <div className="wave">
            {Array.from({ length: 25 }, (_, i) => <i key={i} style={{ '--i': i } as CSSProperties} />)}
          </div>
        </div>

        <div className="lobby-body">
          <div className="lobby-status">
            <span className={`live-badge${live ? '' : ' ended'}`}>{live ? 'Live' : 'Ended'}</span>
            <span className="sr-only">Status: {live ? 'Live' : 'Ended'}</span>
          </div>

          <h1 className="display lobby-title">{room.title}</h1>

          <div className="lobby-host">
            <Avatar name={host_name} size={44} />
            <div>
              <div className="faint" style={{ fontSize: 12.5 }}>Hosted by</div>
              <strong>{host_name}</strong>
            </div>
          </div>

          {room.description && <p className="lede lobby-desc">{room.description}</p>}

          <div className="lobby-chips">
            {room.topic && <span className="chip"><Tag aria-hidden="true" />{room.topic}</span>}
            {room.language && <span className="chip"><Globe aria-hidden="true" />{languageName(room.language)}</span>}
            {room.hands_enabled && <span className="chip"><Hand aria-hidden="true" />Hands welcome</span>}
          </div>

          <hr className="divider" />

          {live ? (
            <>
              <div className="lobby-cta">
                <button type="button" className="btn btn-primary btn-lg" onClick={() => setJoined(true)}>
                  <Headphones size={20} />Join and listen
                </button>
                <button type="button" className="btn btn-outline btn-lg" onClick={copy}>
                  {copied ? <><Check size={18} />Copied</> : <><Link2 size={18} />Copy link</>}
                </button>
              </div>
              <ul className="lobby-notes">
                <li><Headphones size={16} /><span>You’ll join as a listener. No microphone prompt.</span></li>
                <li><Hand size={16} /><span>Signed-in listeners can raise a hand to ask for the stage.</span></li>
                <li><Mic size={16} /><span>Your mic only turns on if you accept an invite.</span></li>
              </ul>
            </>
          ) : (
            <div className="alert alert-info" role="status">
              <Radio />
              <div>
                <strong>This conversation is over.</strong>
                <div className="muted">The host ended the room. Find another one on the Explore page.</div>
              </div>
            </div>
          )}
        </div>
      </article>
    </main>
  );
}
